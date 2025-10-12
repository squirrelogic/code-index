/**
 * Search result from code index
 */
export interface SearchResult {
  // File information
  id: string; // Entry ID
  path: string; // Relative file path
  filename: string; // Base filename
  language: string | null; // Programming language

  // Match information
  matches: Match[]; // All matches in this file
  score: number; // Relevance score (0-100)

  // Context
  fileSize: number; // File size in bytes
  lastModified: Date; // Last modification time
}

/**
 * Individual match within a file
 */
export interface Match {
  line: number; // Line number (1-based)
  column: number; // Column number (1-based)
  text: string; // The matched text
  context: string; // Surrounding context (full line or snippet)
  contextBefore?: string; // Optional: line before match
  contextAfter?: string; // Optional: line after match
}

/**
 * Search query parameters
 */
export interface SearchQuery {
  query: string; // Search query text or pattern
  isRegex: boolean; // Whether query is a regular expression
  caseSensitive: boolean; // Case-sensitive search
  wholeWord: boolean; // Match whole words only
  limit: number; // Maximum results to return
  offset: number; // Pagination offset
  filePatterns?: string[]; // Optional file patterns to include
  excludePatterns?: string[]; // Optional file patterns to exclude
  languages?: string[]; // Optional language filters
}

/**
 * Default search query parameters
 */
export const DEFAULT_SEARCH_QUERY: SearchQuery = {
  query: '',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  limit: 100,
  offset: 0
};

/**
 * Search statistics
 */
export interface SearchStats {
  totalMatches: number; // Total number of matches found
  filesSearched: number; // Number of files searched
  searchTimeMs: number; // Search time in milliseconds
  indexSize: number; // Total size of indexed files
  query: SearchQuery; // The query that was executed
}

/**
 * Formats a match for display
 */
export function formatMatch(result: SearchResult, match: Match): string {
  const lineNum = match.line.toString().padStart(4, ' ');
  return `${result.path}:${lineNum}: ${match.context}`;
}

/**
 * Sorts search results by relevance score
 */
export function sortByRelevance(results: SearchResult[]): SearchResult[] {
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Groups search results by file extension
 */
export function groupByExtension(results: SearchResult[]): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>();

  for (const result of results) {
    const ext = result.filename.match(/\.[^.]+$/)?.[0] || 'no-extension';
    const group = groups.get(ext) || [];
    group.push(result);
    groups.set(ext, group);
  }

  return groups;
}

/**
 * Calculates relevance score based on various factors
 */
export function calculateRelevance(
  matches: Match[],
  fileSize: number,
  isExactMatch: boolean = false
): number {
  let score = 0;

  // Base score for having matches
  score += Math.min(matches.length * 10, 50);

  // Bonus for exact matches
  if (isExactMatch) {
    score += 30;
  }

  // Penalty for large files (less likely to be relevant)
  if (fileSize > 100000) { // 100KB
    score -= 10;
  }

  // Bonus for matches early in file
  const avgLine = matches.reduce((sum, m) => sum + m.line, 0) / matches.length;
  if (avgLine < 50) {
    score += 10;
  }

  return Math.min(Math.max(score, 0), 100); // Clamp between 0-100
}