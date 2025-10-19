import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { SearcherService } from '../../services/searcher.js';
import { OutputFormatter } from '../utils/output.js';
import { HybridRanker } from '../../services/hybrid-ranker.js';
import { PathDiversifier } from '../../services/path-diversifier.js';
import { TieBreaker } from '../../services/tie-breaker.js';
import { PerformanceMonitor } from '../../services/performance-monitor.js';
import { ConfigurationService } from '../../services/configuration-service.js';
import { VectorStorageService } from '../../services/vector-storage.js';
import { OnnxEmbeddingAdapter } from '../../services/embedding/onnx-adapter.js';
import { MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } from '../../constants/ranking-constants.js';
import { hasExtremeWeights } from '../../lib/ranking-utils.js';
import type { RankingCandidate, SymbolType } from '../../models/ranking-candidate.js';
import type { HybridSearchResult } from '../../models/hybrid-search-result.js';
import type { SearchResult } from '../../models/search-result.js';
import type { EmbeddingQueryResult } from '../../models/embedding-vector.js';
import type { RankingConfig } from '../../models/ranking-config.js';

interface SearchCommandOptions {
  limit?: string;
  caseSensitive?: boolean;
  regex?: boolean;
  files?: string;
  language?: string;
  format?: 'human' | 'json';
  stats?: boolean;
  // Hybrid search options
  hybrid?: boolean;
  lexicalOnly?: boolean;
  vectorOnly?: boolean;
  noDiversification?: boolean;
  explain?: boolean;
  // Configuration overrides
  alpha?: string;
  beta?: string;
  gamma?: string;
  config?: string;
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
    .option('--hybrid', 'Use hybrid search (combines lexical + vector search)')
    .option('--lexical-only', 'Use only lexical search in hybrid mode')
    .option('--vector-only', 'Use only vector search in hybrid mode')
    .option('--no-diversification', 'Disable path diversification in results')
    .option('--explain', 'Show detailed score breakdown and tie-breaker details')
    .option('--alpha <weight>', 'Override lexical weight (0.0-1.0)')
    .option('--beta <weight>', 'Override vector weight (0.0-1.0)')
    .option('--gamma <weight>', 'Override tie-breaker weight (0.0-1.0)')
    .option('--config <path>', 'Use custom ranking configuration file')
    .action(async (query: string, options: SearchCommandOptions) => {
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

        // Handle hybrid search if requested
        if (options.hybrid) {
          await handleHybridSearch(query, options, database, formatter);
          database.close();
          return;
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

/**
 * Handle hybrid search request
 */
async function handleHybridSearch(
  query: string,
  options: SearchCommandOptions,
  database: DatabaseService,
  formatter: OutputFormatter
): Promise<void> {
  // Validate query length
  if (query.length < MIN_QUERY_LENGTH) {
    formatter.error('Query too short', {
      message: `Query must be at least ${MIN_QUERY_LENGTH} characters`,
      query
    });
    process.exit(1);
  }

  if (query.length > MAX_QUERY_LENGTH) {
    formatter.error('Query too long', {
      message: `Query must be at most ${MAX_QUERY_LENGTH} characters`,
      query,
      queryLength: query.length
    });
    process.exit(1);
  }

  // Validate mutually exclusive flags
  if (options.lexicalOnly && options.vectorOnly) {
    formatter.error('Conflicting options', {
      message: 'Cannot use both --lexical-only and --vector-only flags together'
    });
    process.exit(1);
  }

  // Load configuration
  const configService = options.config
    ? new ConfigurationService(options.config)
    : new ConfigurationService();

  let config = configService.getConfig();
  const warnings: string[] = [...configService.getWarnings()];

  // Apply weight overrides from CLI flags (T026)
  if (options.alpha || options.beta || options.gamma) {
    const alpha = options.alpha ? parseFloat(options.alpha) : config.fusion.alpha;
    const beta = options.beta ? parseFloat(options.beta) : config.fusion.beta;
    const gamma = options.gamma ? parseFloat(options.gamma) : config.fusion.gamma;

    // Validate weights
    if (isNaN(alpha) || alpha < 0 || alpha > 1) {
      formatter.error('Invalid alpha weight', {
        message: 'Alpha must be a number between 0.0 and 1.0',
        value: options.alpha
      });
      process.exit(1);
    }

    if (isNaN(beta) || beta < 0 || beta > 1) {
      formatter.error('Invalid beta weight', {
        message: 'Beta must be a number between 0.0 and 1.0',
        value: options.beta
      });
      process.exit(1);
    }

    if (isNaN(gamma) || gamma < 0 || gamma > 1) {
      formatter.error('Invalid gamma weight', {
        message: 'Gamma must be a number between 0.0 and 1.0',
        value: options.gamma
      });
      process.exit(1);
    }

    // Check weight sum
    const weightSum = alpha + beta + gamma;
    if (weightSum > 1.0) {
      formatter.error('Invalid weight sum', {
        message: `Weights sum to ${weightSum.toFixed(3)}, must be <= 1.0`,
        alpha,
        beta,
        gamma
      });
      process.exit(1);
    }

    // Apply overrides
    config = {
      ...config,
      fusion: {
        ...config.fusion,
        alpha,
        beta,
        gamma
      }
    };

    // Check for extreme weights
    if (hasExtremeWeights(config)) {
      if (alpha === 0) warnings.push('Warning: alpha = 0 (lexical search disabled)');
      if (beta === 0) warnings.push('Warning: beta = 0 (vector search disabled)');
      if (alpha > 0.9) warnings.push('Warning: alpha > 0.9 (lexical heavily favored)');
      if (beta > 0.9) warnings.push('Warning: beta > 0.9 (vector heavily favored)');
    }
  }

  // Apply diversification flag (T031)
  if (options.noDiversification) {
    config = {
      ...config,
      diversification: {
        ...config.diversification,
        enabled: false
      }
    };
  }

  const performanceMonitor = new PerformanceMonitor(config.performance.timeoutMs);

  try {
    // Step 1: Parallel candidate retrieval
    performanceMonitor.startTimer('lexicalSearch');
    performanceMonitor.startTimer('vectorSearch');

    const enableLexical = !options.vectorOnly;
    const enableVector = !options.lexicalOnly;

    // Candidate retrieval from actual services
    const lexicalCandidates: RankingCandidate[] = enableLexical ? getLexicalCandidates(query, database, config) : [];
    performanceMonitor.stopTimer('lexicalSearch');

    const vectorCandidates: RankingCandidate[] = enableVector ? await getVectorCandidates(query, database, config) : [];
    performanceMonitor.stopTimer('vectorSearch');

    // Track fallback mode
    if (lexicalCandidates.length === 0 && vectorCandidates.length > 0) {
      performanceMonitor.setFallbackMode('vector');
      warnings.push('Lexical search returned no results, using vector-only mode');
    } else if (vectorCandidates.length === 0 && lexicalCandidates.length > 0) {
      performanceMonitor.setFallbackMode('lexical');
      warnings.push('Vector search returned no results, using lexical-only mode');
    }

    // Step 2: Fusion & Ranking
    performanceMonitor.startTimer('ranking');

    const ranker = new HybridRanker(config);
    let results = ranker.rank(lexicalCandidates, vectorCandidates);

    // Step 3: Path Diversification
    const diversifier = new PathDiversifier(config.diversification);
    results = diversifier.diversify(results);

    // Step 4: Tie-Breaking
    const tieBreaker = new TieBreaker(config.tieBreakers);
    results = tieBreaker.applyTieBreakers(results, query);

    performanceMonitor.stopTimer('ranking');

    // Step 5: Collect metrics
    performanceMonitor.recordCandidateCounts(
      lexicalCandidates.length,
      vectorCandidates.length,
      results.length
    );

    const metrics = performanceMonitor.getMetrics();

    // Check SLA violation
    if (metrics.slaViolation) {
      warnings.push(`Search exceeded timeout (${metrics.totalTimeMs}ms > ${config.performance.timeoutMs}ms)`);
    }

    // Build hybrid search result
    const hybridResult: HybridSearchResult = {
      results: results.slice(0, parseInt(options.limit || '10')),
      totalFound: results.length,
      query: {
        query,
        enableLexical,
        enableVector,
        limit: parseInt(options.limit || '10'),
        offset: 0
      },
      appliedConfig: config,
      metrics,
      warnings
    };

    // Format output
    if (options.format === 'json') {
      formatHybridResultsJSON(hybridResult);
    } else {
      formatHybridResults(hybridResult, options.explain || false);
    }

    process.exit(metrics.slaViolation ? 3 : 0);
  } catch (error) {
    formatter.error('Hybrid search failed', {
      message: error instanceof Error ? error.message : String(error),
      query
    });
    process.exit(1);
  }
}

/**
 * Format hybrid search results for human-readable terminal display (T021, enhanced T035)
 */
function formatHybridResults(result: HybridSearchResult, explain: boolean = false): void {
  const { results, totalFound, query, metrics, warnings } = result;

  // Header
  console.log(chalk.bold('\n🔍 Hybrid Search Results'));
  console.log(chalk.dim(`Query: ${query.query}`));
  console.log(chalk.dim(`Timing: ${metrics.totalTimeMs}ms (lexical: ${metrics.lexicalSearchTimeMs}ms, vector: ${metrics.vectorSearchTimeMs}ms, ranking: ${metrics.rankingTimeMs}ms)`));
  console.log('');

  // Results
  if (results.length === 0) {
    console.log(chalk.yellow('No matches found'));
    console.log('');
  } else {
    console.log(chalk.green(`Found ${totalFound} matches, showing top ${results.length}:`));
    console.log('');

    for (const r of results) {
      // Result header with score
      console.log(
        chalk.blue.bold(`[Score: ${r.finalScore.toFixed(3)}]`) +
        ' ' +
        chalk.cyan(`${r.filePath}:${r.lineNumber}`) +
        (r.symbolType ? chalk.dim(` [${r.symbolType}${r.symbolName ? `: ${r.symbolName}` : ''}]`) : '')
      );

      // Score breakdown
      const lexScore = r.scoreBreakdown.lexicalContribution.toFixed(3);
      const vecScore = r.scoreBreakdown.vectorContribution.toFixed(3);
      const tieScore = r.scoreBreakdown.tieBreakerContribution.toFixed(3);

      console.log(
        chalk.dim(`  Lexical: ${lexScore}`) +
        (r.scoreBreakdown.lexicalRank ? chalk.dim(` (#${r.scoreBreakdown.lexicalRank})`) : '') +
        chalk.dim(`, Vector: ${vecScore}`) +
        (r.scoreBreakdown.vectorRank ? chalk.dim(` (#${r.scoreBreakdown.vectorRank})`) : '') +
        chalk.dim(`, Tie: +${tieScore}`)
      );

      // Show detailed explanation if --explain flag is set (T035)
      if (explain && r.scoreBreakdown.tieBreakerScores) {
        const tb = r.scoreBreakdown.tieBreakerScores;
        console.log(chalk.dim('  Tie-breaker details:'));
        console.log(chalk.dim(`    • Symbol type priority: ${tb.symbolTypePriority.toFixed(3)}`));
        console.log(chalk.dim(`    • Path priority: ${tb.pathPriority.toFixed(3)}`));
        console.log(chalk.dim(`    • Language match: ${tb.languageMatch.toFixed(3)}`));
        console.log(chalk.dim(`    • Identifier match: ${tb.identifierMatch.toFixed(3)}`));
        console.log(chalk.dim(`    • Combined: ${tb.combinedScore.toFixed(3)}`));
      }

      if (explain && r.scoreBreakdown.diversityPenalty !== undefined) {
        console.log(chalk.dim(`  Diversity penalty: -${r.scoreBreakdown.diversityPenalty.toFixed(3)}`));
      }

      if (explain) {
        console.log(chalk.dim(`  Original ranks: Lexical #${r.scoreBreakdown.lexicalRank || 'N/A'}, Vector #${r.scoreBreakdown.vectorRank || 'N/A'}`));
        if (r.scoreBreakdown.lexicalScore !== undefined) {
          console.log(chalk.dim(`  Raw scores: BM25=${r.scoreBreakdown.lexicalScore.toFixed(3)}, Cosine=${r.scoreBreakdown.vectorScore?.toFixed(3) || 'N/A'}`));
        }
      }

      // Code preview
      console.log(chalk.dim(`  ${r.snippet}`));
      console.log('');
    }
  }

  // Footer with warnings
  if (warnings.length > 0) {
    console.log(chalk.yellow('⚠ Warnings:'));
    for (const warning of warnings) {
      console.log(chalk.yellow(`  • ${warning}`));
    }
    console.log('');
  }

  // Performance indicator
  if (metrics.slaViolation) {
    console.log(chalk.red('✗') + chalk.dim(` Search exceeded timeout (${metrics.totalTimeMs}ms)`));
  } else if (metrics.totalTimeMs < 100) {
    console.log(chalk.green('✓') + chalk.dim(` Search completed in ${metrics.totalTimeMs}ms`));
  } else {
    console.log(chalk.yellow('⚠') + chalk.dim(` Search took ${metrics.totalTimeMs}ms`));
  }
}

/**
 * Format hybrid search results as JSON (T022)
 */
function formatHybridResultsJSON(result: HybridSearchResult): void {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Helper: Map chunk type to symbol type for tie-breaking
 */
function mapChunkTypeToSymbolType(chunkType: string | null): SymbolType {
  if (!chunkType) return 'unknown';

  const mapping: Record<string, SymbolType> = {
    'function': 'function',
    'class': 'class',
    'method': 'method',
    'interface': 'interface',
    'type': 'type',
    'variable': 'variable',
    'constant': 'constant',
    'property': 'property',
    'comment': 'comment',
  };

  return mapping[chunkType] || 'unknown';
}

/**
 * Helper: Get chunk metadata by ID
 */
function getChunkById(chunkId: string, database: DatabaseService): any | null {
  try {
    const stmt = database.prepare(`
      SELECT
        id, file_id, name, content, start_line, end_line,
        chunk_type, language
      FROM chunks
      WHERE id = ?
    `);
    return stmt.get(chunkId);
  } catch (error) {
    console.warn(`Failed to get chunk ${chunkId}:`, error);
    return null;
  }
}

/**
 * Helper: Convert SearchResult[] to RankingCandidate[]
 */
function convertSearchResultsToCandidates(
  results: SearchResult[],
  source: 'lexical' | 'vector'
): RankingCandidate[] {
  const candidates: RankingCandidate[] = [];

  for (let rank = 0; rank < results.length; rank++) {
    const result = results[rank];
    if (!result) continue;

    // For each match in the file, create a candidate
    for (const match of result.matches) {
      if (!match) continue;

      candidates.push({
        source,
        sourceRank: rank + 1, // 1-based ranking
        sourceScore: result.score || 0,
        fileId: result.id,
        filePath: result.path,
        lineNumber: match.line,
        columnNumber: match.column,
        snippet: (match.context || '').substring(0, 200), // Limit snippet length
        symbolName: undefined, // Not available from lexical search
        symbolType: undefined, // Not available from lexical search
        language: result.language || undefined,
        fileSize: result.fileSize || 0,
        lastModified: result.lastModified || new Date()
      });
    }
  }

  return candidates;
}

/**
 * Helper: Convert EmbeddingQueryResult[] to RankingCandidate[]
 */
function convertVectorResultsToCandidates(
  results: EmbeddingQueryResult[],
  database: DatabaseService
): RankingCandidate[] {
  const candidates: RankingCandidate[] = [];

  for (let rank = 0; rank < results.length; rank++) {
    const result = results[rank];
    if (!result) continue;

    // Get chunk metadata from database
    const chunk = getChunkById(result.chunk_id, database);
    if (!chunk) continue;

    // Get file entry to get file metadata
    const fileEntry = database.getEntryByPath(chunk.file_id); // Note: file_id might be path
    if (!fileEntry) {
      // Try treating file_id as actual ID
      const stmt = database.prepare('SELECT * FROM code_entries WHERE id = ?');
      const file = stmt.get(chunk.file_id);
      if (!file) continue;
    }

    candidates.push({
      source: 'vector',
      sourceRank: rank + 1,
      sourceScore: result.similarity || 0, // Cosine similarity [0,1]
      fileId: chunk.file_id || '',
      filePath: fileEntry?.path || chunk.file_id || '', // Fallback to file_id if path not found
      lineNumber: chunk.start_line || 1,
      columnNumber: undefined,
      snippet: (chunk.content || '').substring(0, 200), // Preview
      symbolName: chunk.name || undefined,
      symbolType: mapChunkTypeToSymbolType(chunk.chunk_type),
      language: chunk.language || undefined,
      fileSize: fileEntry?.size || 0,
      lastModified: fileEntry?.fileModifiedAt || new Date()
    });
  }

  return candidates;
}

/**
 * Get lexical search candidates from SearcherService
 */
function getLexicalCandidates(
  query: string,
  database: DatabaseService,
  config: RankingConfig
): RankingCandidate[] {
  try {
    const searcher = new SearcherService(database);
    const searchResults = searcher.search(query, {
      limit: config.performance.candidateLimit, // 200 by default
      caseSensitive: false,
      regex: false
    });

    return convertSearchResultsToCandidates(searchResults, 'lexical');
  } catch (error) {
    console.warn('Lexical search failed:', error);
    return [];
  }
}

/**
 * Get vector search candidates from VectorStorageService
 *
 * Generates an embedding for the query and searches for similar code chunks
 * using vector similarity (cosine distance). Falls back to empty array on error.
 */
async function getVectorCandidates(
  query: string,
  database: DatabaseService,
  config: RankingConfig
): Promise<RankingCandidate[]> {
  try {
    // Get raw database instance for VectorStorageService
    const db = database.getRawDatabase();

    // Initialize vector storage service
    const vectorStorage = new VectorStorageService(db);

    // Initialize ONNX embedding adapter
    const adapter = new OnnxEmbeddingAdapter(
      {
        type: 'onnx',
        name: 'Local: all-MiniLM-L6-v2',
        modelPath: '.codeindex/models/all-MiniLM-L6-v2.onnx',
        useGpu: false,
        threads: 4
      },
      'all-MiniLM-L6-v2',
      384,
      '1.0'
    );

    // Initialize adapter (loads model)
    const initResult = await adapter.initialize();
    if (initResult.isErr()) {
      console.warn('Vector search unavailable:', initResult.error.message);
      return [];
    }

    // Generate query embedding
    const embedResult = await adapter.embed([query]);
    if (embedResult.isErr()) {
      console.warn('Failed to generate query embedding:', embedResult.error.message);
      await adapter.dispose();
      return [];
    }

    // Extract embedding vector from batch result
    const firstVector = embedResult.value.vectors[0];
    if (!firstVector) {
      console.warn('No embedding vector generated for query');
      await adapter.dispose();
      return [];
    }
    const queryVector = new Float32Array(firstVector);

    // Find similar vectors
    const similarResult = vectorStorage.findSimilar(
      queryVector,
      adapter.id, // 'onnx:all-MiniLM-L6-v2'
      config.performance.candidateLimit // Default: 200
    );

    if (similarResult.isErr()) {
      console.warn('Vector search failed:', similarResult.error.message);
      await adapter.dispose();
      return [];
    }

    // Convert to ranking candidates
    const candidates = convertVectorResultsToCandidates(similarResult.value, database);

    // Cleanup adapter resources
    await adapter.dispose();

    return candidates;
  } catch (error) {
    console.warn('Vector search failed:', error);
    return [];
  }
}