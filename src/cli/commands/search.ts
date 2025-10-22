/**
 * Simplified Search Command
 *
 * Uses hybrid search by default with enriched AST results.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { SearchService } from '../../services/searcher.js';
import { HybridIndex } from '../../services/hybrid-index.js';
import { SymbolIndex } from '../../services/symbol-index.js';
import { ASTPersistenceService } from '../../services/ast-persistence.js';
import { OnnxEmbedder } from '../../services/onnx-embedder.js';
import { IndexStoreService } from '../../services/index-store.js';
import { OutputFormatter } from '../utils/output.js';

interface SearchCommandOptions {
  limit?: string;
  format?: 'human' | 'json';
  denseWeight?: string;
  sparseWeight?: string;
  noAst?: boolean;
}

export function createSearchCommand(): Command {
  return new Command('search')
    .description('Search indexed codebase using hybrid sparse+dense vectors')
    .argument('<query>', 'Search query')
    .option('-l, --limit <n>', 'Maximum number of results', '10')
    .option('--format <type>', 'Output format (human|json)', 'human')
    .option('--dense-weight <n>', 'Weight for dense similarity (0-1)', '0.6')
    .option('--sparse-weight <n>', 'Weight for sparse similarity (0-1)', '0.4')
    .option('--no-ast', 'Exclude AST from results (faster)')
    .action(async (query: string, options: SearchCommandOptions) => {
      try {
        await executeSearch(query, options);
      } catch (error: any) {
        console.error(chalk.red('Search error:'), error.message);
        process.exit(1);
      }
    });
}

async function executeSearch(
  query: string,
  options: SearchCommandOptions
): Promise<void> {
  const projectRoot = process.cwd();
  const codeIndexDir = join(projectRoot, '.codeindex');

  // Check if initialized
  if (!existsSync(codeIndexDir)) {
    throw new Error('Code-index not initialized. Run "code-index init" first.');
  }

  const output = new OutputFormatter(
    options.format === 'json' ? ('json' as any) : ('human' as any)
  );

  // Parse options
  const limit = parseInt(options.limit || '10', 10);
  const denseWeight = parseFloat(options.denseWeight || '0.6');
  const sparseWeight = parseFloat(options.sparseWeight || '0.4');
  const includeAst = !options.noAst;

  // Initialize services
  const dbPath = join(codeIndexDir, 'index.db');
  const database = new DatabaseService(dbPath);

  const modelPath = join(codeIndexDir, 'models', 'gte-small.onnx');
  const embedder = new OnnxEmbedder(modelPath);
  await embedder.init();

  const indexStore = new IndexStoreService(codeIndexDir);
  const astPersistence = new ASTPersistenceService(codeIndexDir);

  const hybridIndex = new HybridIndex(embedder, indexStore, {
    denseWeight,
    sparseWeight,
    ngram: { minGram: 3, maxGram: 5, numFeatures: 262144 },
  });

  // Load index
  const loaded = await hybridIndex.load();
  if (!loaded) {
    throw new Error(
      'No index found. Run "code-index index" to create the index.'
    );
  }

  const symbolIndex = new SymbolIndex();
  const searchService = new SearchService(hybridIndex, symbolIndex, astPersistence);

  // Perform search
  const startTime = Date.now();
  const results = await searchService.search(query, {
    limit,
    denseWeight,
    sparseWeight,
    includeAst,
  });
  const searchTime = Date.now() - startTime;

  // Display results
  if (options.format === 'json') {
    output.success('Search complete', {
      query,
      results,
      count: results.length,
      searchTimeMs: searchTime,
    });
  } else {
    // Human-readable output
    console.log(chalk.cyan(`\nSearch: "${query}"`));
    console.log(chalk.gray(`Found ${results.length} results in ${searchTime}ms\n`));

    if (results.length === 0) {
      console.log(chalk.yellow('No results found'));
      return;
    }

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result) continue;

      console.log(
        chalk.bold.white(`${i + 1}. ${result.filePath}`) +
          chalk.gray(` (score: ${result.score.toFixed(3)})`)
      );
      console.log(
        chalk.gray(
          `   Dense: ${result.denseScore.toFixed(3)}, Sparse: ${result.sparseScore.toFixed(3)}`
        )
      );
      console.log(chalk.gray(`   Anchor: ${result.anchor}`));

      // Show first few symbols if AST available
      if (result.ast) {
        const symbols: Array<{ kind: string; name: string }> = [];

        // Collect symbols from all categories
        if (result.ast.functions) {
          for (const name of Object.keys(result.ast.functions).slice(0, 3)) {
            symbols.push({ kind: 'function', name });
          }
        }
        if (result.ast.classes && symbols.length < 3) {
          for (const name of Object.keys(result.ast.classes).slice(0, 3 - symbols.length)) {
            symbols.push({ kind: 'class', name });
          }
        }

        if (symbols.length > 0) {
          console.log(
            chalk.dim(
              `   Symbols: ${symbols.map(s => `${s.kind} ${s.name}`).join(', ')}`
            )
          );
        }
      }

      console.log();
    }
  }

  // Cleanup
  await embedder.dispose();
  database.close();
}
