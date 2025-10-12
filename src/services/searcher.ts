import { DatabaseService } from './database.js';
import { SearchResult, Match } from '../models/search-result.js';
import path from 'path';

export interface SearchOptions {
  limit?: number;
  caseSensitive?: boolean;
  regex?: boolean;
  filePattern?: string;
  language?: string;
}

export class SearcherService {
  private database: DatabaseService;

  constructor(database: DatabaseService) {
    this.database = database;
  }

  /**
   * Search for text using FTS5 or regex patterns
   */
  public search(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit || 100;

    if (options.regex) {
      return this.searchRegex(query, options, limit);
    } else {
      return this.searchText(query, options, limit);
    }
  }

  /**
   * Full-text search using FTS5
   */
  private searchText(query: string, _options: SearchOptions, limit: number): SearchResult[] {
    // Prepare the FTS5 query
    let ftsQuery = query;

    // Escape special FTS5 characters if not using advanced syntax
    if (!query.includes('"') && !query.includes('*')) {
      ftsQuery = query.replace(/[^a-zA-Z0-9\s]/g, '');
    }

    // Case-insensitive by default in FTS5
    const rows = this.database.searchText(ftsQuery, limit);

    return rows.map(row => this.rowToSearchResult(row, query));
  }

  /**
   * Regular expression search
   */
  private searchRegex(pattern: string, options: SearchOptions, limit: number): SearchResult[] {
    // Get all text entries from database
    const entries = this.database.getAllEntries();
    const results: SearchResult[] = [];

    try {
      const regex = new RegExp(pattern, options.caseSensitive ? 'gm' : 'gim');

      for (const entry of entries) {
        if (!entry.isText || !entry.content) continue;

        // Apply file pattern filter if specified
        if (options.filePattern) {
          const fileRegex = new RegExp(options.filePattern);
          if (!fileRegex.test(entry.path)) continue;
        }

        // Apply language filter if specified
        if (options.language && entry.language !== options.language) {
          continue;
        }

        const matches: Match[] = [];
        const lines = entry.content.split('\n');

        lines.forEach((line, index) => {
          const lineMatches = line.matchAll(regex);
          for (const match of lineMatches) {
            if (match.index !== undefined) {
              matches.push({
                line: index + 1,
                column: match.index + 1,
                text: match[0],
                context: this.createSnippet(line, match.index, match[0].length)
              });
            }
          }
        });

        if (matches.length > 0) {
          results.push({
            id: entry.id,
            path: entry.path,
            filename: path.basename(entry.path),
            language: entry.language || null,
            score: this.calculateScore(matches.length, entry.path, pattern),
            matches,
            fileSize: entry.size,
            lastModified: entry.fileModifiedAt
          });

          if (results.length >= limit) break;
        }
      }

      // Sort by score (descending)
      results.sort((a, b) => b.score - a.score);
    } catch (error) {
      throw new Error(`Invalid regular expression: ${error}`);
    }

    return results.slice(0, limit);
  }

  /**
   * Convert database row to SearchResult
   */
  private rowToSearchResult(row: any, query: string): SearchResult {
    const lines = row.content ? row.content.split('\n') : [];
    const snippet = row.snippet || '';

    // Extract match information from snippet
    const matches: Match[] = [];

    if (snippet) {
      // Find the matched line in content
      const snippetText = snippet.replace(/<mark>|<\/mark>/g, '');
      const lineIndex = lines.findIndex((line: string) => line.includes(snippetText.trim()));

      if (lineIndex !== -1) {
        matches.push({
          line: lineIndex + 1,
          column: 1,
          text: query,
          context: snippet
        });
      }
    }

    return {
      id: row.id,
      path: row.path,
      filename: row.filename,
      language: row.language || null,
      score: Math.abs(row.rank || 0), // FTS5 rank is negative (better matches are more negative)
      matches,
      fileSize: row.size || 0,
      lastModified: row.file_modified_at ? new Date(row.file_modified_at) : new Date()
    };
  }

  /**
   * Create a snippet around the match
   */
  private createSnippet(line: string, matchIndex: number, matchLength: number): string {
    const contextBefore = 30;
    const contextAfter = 30;

    let start = Math.max(0, matchIndex - contextBefore);
    let end = Math.min(line.length, matchIndex + matchLength + contextAfter);

    let snippet = '';

    if (start > 0) snippet += '...';
    snippet += line.substring(start, matchIndex);
    snippet += '<mark>' + line.substring(matchIndex, matchIndex + matchLength) + '</mark>';
    snippet += line.substring(matchIndex + matchLength, end);
    if (end < line.length) snippet += '...';

    return snippet;
  }

  /**
   * Calculate relevance score for search results
   */
  private calculateScore(matchCount: number, filePath: string, query: string): number {
    let score = matchCount * 10;

    // Boost score for matches in filename
    const filename = path.basename(filePath).toLowerCase();
    if (filename.includes(query.toLowerCase())) {
      score += 50;
    }

    // Boost for exact filename match
    if (filename === query.toLowerCase()) {
      score += 100;
    }

    // Slight penalty for deeply nested files
    const depth = filePath.split('/').length;
    score -= depth * 0.5;

    // Boost for common source directories
    if (filePath.includes('/src/') || filePath.includes('/lib/')) {
      score += 5;
    }

    return Math.max(score, 0);
  }

  /**
   * Get statistics about the index
   */
  public getIndexStats(): { totalFiles: number; totalSize: number; languages: Record<string, number> } {
    const entries = this.database.getAllEntries();

    const stats = {
      totalFiles: entries.length,
      totalSize: 0,
      languages: {} as Record<string, number>
    };

    for (const entry of entries) {
      stats.totalSize += entry.size;
      const lang = entry.language || 'unknown';
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;
    }

    return stats;
  }
}