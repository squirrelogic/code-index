/**
 * Embed Command
 *
 * Implements the `code-index embed` CLI command for generating embeddings.
 * Based on contracts/cli-embed-command.yaml
 */

import { Command } from 'commander';
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';
import { EmbeddingService, EmbeddingServiceOptions } from '../../services/embedding/embedding-service.js';
import { OnnxAdapterFactory } from '../../services/embedding/onnx-adapter-factory.js';
import { getAdapterRegistry } from '../../services/embedding/model-registry.js';
import { getConfigManager } from '../../lib/env-config.js';

/**
 * CLI options for embed command
 */
interface EmbedCommandOptions {
	model?: string;
	dryRun?: boolean;
	force?: boolean;
	batchSize?: number;
	json?: boolean;
	verbose?: boolean;
	quiet?: boolean;
}

/**
 * Create the embed command
 */
export function createEmbedCommand(): Command {
	const cmd = new Command('embed');

	cmd
		.description('Generate or update embedding vectors for code chunks')
		.option('--model <name>', 'Override the default embedding model')
		.option('--dry-run', 'Preview what would be embedded without performing the operation')
		.option('--force', 'Force re-embedding of all chunks, even if unchanged')
		.option('--batch-size <number>', 'Number of chunks to process in each batch', parseInt)
		.option('--json', 'Output results in JSON format for scripting')
		.option('--verbose, -v', 'Enable detailed progress output')
		.option('--quiet, -q', 'Suppress all output except errors')
		.action(async (options: EmbedCommandOptions) => {
			try {
				await runEmbedCommand(options);
			} catch (error) {
				console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
				process.exit(1);
			}
		});

	return cmd;
}

/**
 * Run the embed command
 */
async function runEmbedCommand(options: EmbedCommandOptions): Promise<void> {
	const projectRoot = process.cwd();
	const codeIndexDir = join(projectRoot, '.codeindex');
	const dbPath = join(codeIndexDir, 'index.db');

	// Check if project is initialized
	if (!existsSync(dbPath)) {
		throw new Error(
			'Project not initialized. Run "code-index init" first.'
		);
	}

	// Validate conflicting flags
	if (options.verbose && options.quiet) {
		throw new Error('Cannot use both --verbose and --quiet flags together');
	}

	// Open database
	const db = Database(dbPath);

	try {
		// Initialize configuration manager
		const configManager = getConfigManager();

		// Get adapter configuration
		const modelId = options.model || 'default';
		const adapterConfigResult = configManager.getAdapterConfig(modelId);

		if (adapterConfigResult.isErr()) {
			throw new Error(adapterConfigResult.error.message);
		}

		const adapterConfig = adapterConfigResult.value;

		// Register ONNX adapter factory if not already registered
		const registry = getAdapterRegistry();
		if (!registry.hasFactory('onnx')) {
			const factory = new OnnxAdapterFactory();
			registry.register(factory);
		}

		// Get or create adapter
		const adapterResult = registry.getOrCreateAdapter(
			adapterConfig.type,
			adapterConfig,
			modelId
		);

		if (adapterResult.isErr()) {
			throw new Error(adapterResult.error.message);
		}

		const adapter = adapterResult.value;

		// Initialize adapter
		if (!options.quiet) {
			console.log('Initializing embedding adapter...');
		}

		const initResult = await adapter.initialize();
		if (initResult.isErr()) {
			throw new Error(`Failed to initialize adapter: ${initResult.error.message}`);
		}

		// Initialize embedding service
		const service = new EmbeddingService(db);

		// Prepare embedding options
		const embeddingOptions: EmbeddingServiceOptions = {
			modelId: adapter.id,
			batchSize: options.batchSize,
			force: options.force,
			dryRun: options.dryRun,
			onProgress: options.quiet
				? undefined
				: (progress) => {
						if (options.verbose) {
							console.log(
								`  Progress: ${progress.processed}/${progress.total} chunks (${((progress.processed / progress.total) * 100).toFixed(1)}%)`
							);
						}
				  },
		};

		// Display header
		if (!options.quiet) {
			console.log('Embedding codebase chunks...\n');
			console.log(`Model: ${adapter.name} (${adapter.dimensions} dimensions)`);
			console.log(
				`Strategy: ${options.force ? 'Full re-embed' : 'Incremental (hash-based change detection)'}\n`
			);
		}

		// Get statistics before embedding
		const statsResult = service.getStatistics(adapter.id);
		if (statsResult.isOk()) {
			const stats = statsResult.value;

			if (!options.quiet) {
				console.log('Analyzing chunks...');
				console.log(`  Total chunks: ${stats.totalChunks}`);
				console.log(`  Already embedded: ${stats.withEmbeddings}`);
				console.log(
					`  Needs embedding: ${stats.withoutEmbeddings + stats.needingUpdate}`
				);
				console.log(`  Unchanged: ${stats.upToDate}\n`);
			}

			// Dry-run mode
			if (options.dryRun) {
				const wouldEmbed = stats.withoutEmbeddings + stats.needingUpdate;

				if (options.json) {
					console.log(
						JSON.stringify({
							command: 'embed',
							status: 'dry-run',
							model: {
								id: adapter.id,
								dimensions: adapter.dimensions,
							},
							analysis: {
								total_chunks: stats.totalChunks,
								would_embed: wouldEmbed,
								would_skip: stats.upToDate,
								would_delete: 0,
							},
							message: 'Run without --dry-run to perform embedding.',
						}, null, 2)
					);
				} else {
					console.log('Dry-run mode: No changes will be made\n');
					console.log('Analysis:');
					console.log(`  Would embed: ${wouldEmbed} chunks`);
					console.log(`  Would skip: ${stats.upToDate} chunks (no changes)`);
					console.log('\nRun without --dry-run to perform embedding.');
				}

				return;
			}
		}

		// Generate embeddings
		if (!options.quiet) {
			console.log('Generating embeddings...');
		}

		const startTime = Date.now();
		const result = await service.embed(adapter, embeddingOptions);

		if (result.isErr()) {
			throw new Error(result.error.message);
		}

		const embedResult = result.value;
		const durationSec = embedResult.durationMs / 1000;

		// Display results
		if (options.json) {
			console.log(
				JSON.stringify({
					command: 'embed',
					status: 'success',
					model: {
						id: adapter.id,
						dimensions: adapter.dimensions,
						adapter_type: adapterConfig.type,
					},
					strategy: options.force ? 'full' : 'incremental',
					stats: {
						total_chunks: embedResult.embedded + embedResult.skipped,
						embedded: embedResult.embedded,
						skipped: embedResult.skipped,
						deleted: embedResult.deleted,
						duration_ms: embedResult.durationMs,
						throughput_per_sec: embedResult.throughput,
					},
					started_at: new Date(startTime).toISOString(),
					completed_at: new Date().toISOString(),
				}, null, 2)
			);
		} else {
			console.log('\nSummary:');
			console.log(`  Embedded: ${embedResult.embedded} chunks`);
			console.log(`  Skipped: ${embedResult.skipped} chunks (no changes)`);
			console.log(`  Deleted: ${embedResult.deleted} chunks`);
			console.log(`  Duration: ${durationSec.toFixed(1)}s`);
			console.log(
				`  Throughput: ${embedResult.throughput.toFixed(1)} chunks/sec`
			);

			if (embedResult.errors.length > 0) {
				console.log(`\n⚠️  Errors: ${embedResult.errors.length}`);
				if (options.verbose) {
					embedResult.errors.forEach((error, i) => {
						console.log(`  ${i + 1}. ${error}`);
					});
				}
			}

			console.log('\n✓ Embedding complete');
		}

		// Cleanup
		await adapter.dispose();
	} finally {
		db.close();
	}
}
