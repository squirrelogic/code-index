import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { SearcherService } from '../../services/searcher.js';
import { OutputFormatter } from '../utils/output.js';

interface SearchCommandOptions {
  limit?: string;
  caseSensitive?: boolean;
  regex?: boolean;
  files?: string;
  language?: string;
  format?: 'human' | 'json';
  stats?: boolean;
}

export function createSearchCommand(): Command {
  return new Command('search')
    .description('Search indexed codebase for patterns')
    .argument('<query>', 'Search query (text or regex pattern)')
    .option('-l, --limit <n>', 'Maximum number of results', '20')
    .option('-c, --case-sensitive', 'Case-sensitive search')
    .option('-r, --regex', 'Treat query as regular expression')
    .option('-f, --files <pattern>', 'Filter by file path pattern (regex)')
    .option('--language <lang>', 'Filter by programming language')
    .option('--format <type>', 'Output format (human or json)', 'human')
    .option('--stats', 'Show index statistics instead of searching')
    .action((query: string, options: SearchCommandOptions) => {
      const cwd = process.cwd();
      const codeIndexDir = join(cwd, '.codeindex');
      const formatter = new OutputFormatter();

      // Check if initialization has been done
      if (!existsSync(codeIndexDir)) {
        formatter.error('Project not initialized', {
          message: 'Project has not been initialized. Please run "code-index init" first.',
          path: cwd
        });
        process.exit(1);
      }

      try {
        // Initialize database
        const database = new DatabaseService(cwd);
        database.open();

        // Check if index exists
        const entryCount = database.getEntryCount();
        if (entryCount === 0) {
          formatter.error('No index found', {
            message: 'No indexed files found. Please run "code-index index" first.',
            suggestion: 'Run: code-index index'
          });
          database.close();
          process.exit(1);
        }

        // Initialize searcher
        const searcher = new SearcherService(database);

        // Show statistics if requested
        if (options.stats) {
          const stats = searcher.getIndexStats();

          if (options.format === 'json') {
            formatter.info('Index Statistics', stats);
          } else {
            console.log(chalk.bold('\nIndex Statistics:'));
            console.log(`  Total files:    ${chalk.cyan(stats.totalFiles)}`);
            console.log(`  Total size:     ${chalk.cyan(formatBytes(stats.totalSize))}`);
            console.log('\n' + chalk.bold('Languages:'));

            const sortedLangs = Object.entries(stats.languages)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10);

            for (const [lang, count] of sortedLangs) {
              console.log(`  ${lang.padEnd(15)} ${chalk.cyan(count)} files`);
            }

            if (Object.keys(stats.languages).length > 10) {
              console.log(`  ... and ${Object.keys(stats.languages).length - 10} more languages`);
            }
          }

          database.close();
          process.exit(0);
        }

        // Perform search
        const startTime = Date.now();
        const results = searcher.search(query, {
          limit: parseInt(options.limit || '20'),
          caseSensitive: options.caseSensitive,
          regex: options.regex,
          filePattern: options.files,
          language: options.language
        });
        const searchTime = Date.now() - startTime;

        database.close();

        // Format output
        if (options.format === 'json') {
          formatter.success('Search Results', {
            query,
            totalResults: results.length,
            searchTime,
            results: results.map(r => ({
              path: r.path,
              language: r.language,
              score: r.score,
              matches: r.matches.map(m => ({
                line: m.line,
                column: m.column,
                text: m.text
              }))
            }))
          });
        } else {
          // Human-readable output
          if (results.length === 0) {
            console.log(chalk.yellow('\nNo matches found for: ') + chalk.cyan(query));
            if (options.regex) {
              console.log(chalk.dim('  (regex mode)'));
            }
          } else {
            console.log(chalk.green(`\nFound ${results.length} matches`) + chalk.dim(` (${searchTime}ms)`));
            console.log('');

            for (const result of results) {
              // File header
              console.log(chalk.blue.bold(result.path) +
                         chalk.dim(` [${result.language}]`) +
                         chalk.yellow(` (${result.matches.length} match${result.matches.length > 1 ? 'es' : ''})`));

              // Show matches
              for (const match of result.matches.slice(0, 3)) {
                const lineStr = String(match.line).padStart(5);
                console.log(chalk.dim(`  ${lineStr}:`), formatMatchLine(match.context, query, options.regex || false));
              }

              if (result.matches.length > 3) {
                console.log(chalk.dim(`        ... and ${result.matches.length - 3} more matches`));
              }

              console.log('');
            }

            // Performance info
            if (searchTime < 100) {
              console.log(chalk.green('✓') + chalk.dim(` Search completed in ${searchTime}ms`));
            } else {
              console.log(chalk.yellow('⚠') + chalk.dim(` Search took ${searchTime}ms (target: <100ms)`));
            }
          }
        }

        process.exit(0);
      } catch (error) {
        formatter.error('Search failed', {
          message: error instanceof Error ? error.message : String(error),
          query
        });
        process.exit(1);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatMatchLine(line: string, query: string, isRegex: boolean): string {
  // Trim long lines
  const maxLength = 80;
  let displayLine = line.trim();

  if (displayLine.length > maxLength) {
    // Try to show context around the match
    const matchIndex = isRegex
      ? displayLine.search(new RegExp(query, 'i'))
      : displayLine.toLowerCase().indexOf(query.toLowerCase());

    if (matchIndex > 0 && matchIndex < displayLine.length - maxLength / 2) {
      const start = Math.max(0, matchIndex - maxLength / 2);
      const end = Math.min(displayLine.length, start + maxLength);
      displayLine = '...' + displayLine.substring(start, end) + '...';
    } else {
      displayLine = displayLine.substring(0, maxLength) + '...';
    }
  }

  // Highlight matches
  if (!isRegex) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    displayLine = displayLine.replace(regex, chalk.black.bgYellow('$1'));
  } else {
    try {
      const regex = new RegExp(`(${query})`, 'gi');
      displayLine = displayLine.replace(regex, chalk.black.bgYellow('$1'));
    } catch {
      // If regex is invalid, just return the line as-is
    }
  }

  return displayLine;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}