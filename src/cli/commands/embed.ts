import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import cliProgress from 'cli-progress';
import { EmbeddingService } from '../../services/embedding/EmbeddingService.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter } from '../utils/output.js';
import type { EmbeddingConfig } from '../../models/EmbeddingConfig.js';
import v8 from 'v8';

interface EmbedOptions {
  rebuild?: boolean;
  files?: string[];
  profile?: string;
  json?: boolean;
  progress?: boolean;
}

/**
 * Embed command implementation
 */
export function createEmbedCommand(): Command {
  const cmd = new Command('embed');

  cmd
    .description('Generate embeddings for indexed files')
    .option('--rebuild', 'Rebuild all embeddings (clear cache)')
    .option('--files <paths...>', 'Embed specific files only')
    .option('--profile <name>', 'Override profile temporarily')
    .option('--json', 'Output result as JSON')
    .option('--no-progress', 'Disable progress display')
    .action(async (options: EmbedOptions) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await generateEmbeddings(projectRoot, options, output);

        if (result.success) {
          output.success('Embeddings generated successfully', {
            summary: result.summary,
            hardware: result.hardware,
            model: result.model,
            fallbacks: result.fallbacks,
            failures: result.failures
          });
        } else {
          output.error('Failed to generate embeddings', result.error);
          process.exit(1);
        }
      } catch (error: any) {
        output.error('Unexpected error during embedding generation', error);
        process.exit(1);
      }
    });

  return cmd;
}

interface EmbedResult {
  success: boolean;
  summary?: {
    total: number;
    cached: number;
    generated: number;
    failed: number;
    duration: number;
    throughput: number;
  };
  hardware?: {
    device: string;
    gpu?: string;
  };
  model?: {
    id: string;
    dimensions: number;
  };
  fallbacks?: number;
  failures?: string[];
  error?: Error;
}

/**
 * Generate embeddings for files
 */
async function generateEmbeddings(
  projectRoot: string,
  options: EmbedOptions,
  output: OutputFormatter
): Promise<EmbedResult> {
  const logger = new Logger(projectRoot);
  logger.info('Starting embedding generation', { options });

  // Check if project is initialized
  const codeIndexDir = join(projectRoot, '.codeindex');
  const configPath = join(codeIndexDir, 'config.json');

  if (!existsSync(configPath)) {
    throw new Error('Project not initialized. Run "code-index init" first.');
  }

  // Load configuration
  const configContent = readFileSync(configPath, 'utf-8');
  const config: EmbeddingConfig = JSON.parse(configContent);

  logger.info('Configuration loaded', { profile: config.profile.name });

  // Initialize embedding service
  const embeddingService = new EmbeddingService();

  try {
    // Initialize service with config
    await embeddingService.initialize(config);

    // Handle --rebuild flag
    if (options.rebuild) {
      output.info('Clearing embedding cache...');
      await embeddingService.clearCache();
      logger.info('Cache cleared');
    }

    // Get files to embed
    const filesToEmbed = await getFilesToEmbed(projectRoot, options, output, logger);

    if (filesToEmbed.length === 0) {
      output.info('No files to embed');
      return {
        success: true,
        summary: {
          total: 0,
          cached: 0,
          generated: 0,
          failed: 0,
          duration: 0,
          throughput: 0
        }
      };
    }

    output.info(`Processing ${filesToEmbed.length} files...`);

    // Generate embeddings with progress
    const result = await embedFilesWithProgress(
      embeddingService,
      filesToEmbed,
      options,
      output,
      logger
    );

    // Get current profile and hardware info
    const currentProfile = embeddingService.getCurrentProfile();
    const hardware = embeddingService.getHardwareCapabilities();

    // Check for fallbacks
    const fallbackHistory = embeddingService.getFallbackHistory();
    const hasFallbacks = embeddingService.hasFallbacks();

    // Display fallback warnings
    if (hasFallbacks && !options.json) {
      output.warning(`⚠️  ${fallbackHistory.length} fallback(s) occurred during embedding generation`);

      for (const event of fallbackHistory) {
        const actionDesc = {
          reduce_batch: 'Reduced batch size',
          switch_device: 'Switched device',
          switch_model: 'Switched to lighter model',
          switch_quantization: 'Changed quantization'
        }[event.action] || event.action;

        output.warning(`  → ${actionDesc}: ${event.reason}`);
      }

      output.info('See .codeindex/logs/embedding.jsonl for detailed fallback logs');
    }

    return {
      success: true,
      summary: result.summary,
      hardware: hardware ? {
        device: currentProfile?.device || 'unknown',
        gpu: hardware.gpu
          ? `${hardware.gpu.vendor} ${hardware.gpu.name}`
          : undefined
      } : undefined,
      model: currentProfile ? {
        id: currentProfile.model,
        dimensions: currentProfile.dimensions
      } : undefined,
      fallbacks: fallbackHistory.length,
      failures: result.failures
    };
  } finally {
    await embeddingService.close();
  }
}

/**
 * Get list of files to embed based on options
 */
async function getFilesToEmbed(
  projectRoot: string,
  options: EmbedOptions,
  _output: OutputFormatter,
  logger: Logger
): Promise<string[]> {
  if (options.files && options.files.length > 0) {
    // Use specified files
    const files = options.files.map(f => join(projectRoot, f));

    // Validate files exist
    const validFiles: string[] = [];
    for (const file of files) {
      if (existsSync(file)) {
        validFiles.push(file);
      } else {
        logger.warn(`File not found: ${file}`);
        _output.warning(`File not found: ${file}`);
      }
    }

    return validFiles;
  }

  // Get indexed files from database
  // TODO: Query DatabaseService for indexed files
  // For now, return empty array
  logger.info('Fetching indexed files from database');
  return [];
}

/**
 * Embed files with progress display
 */
async function embedFilesWithProgress(
  service: EmbeddingService,
  files: string[],
  options: EmbedOptions,
  _output: OutputFormatter,
  logger: Logger
): Promise<{
  summary: {
    total: number;
    cached: number;
    generated: number;
    failed: number;
    duration: number;
    throughput: number;
  };
  failures: string[];
}> {
  const showProgress = options.progress !== false;
  const startTime = Date.now();

  let progressBar: cliProgress.SingleBar | null = null;

  if (showProgress && !options.json) {
    // Create progress bar
    progressBar = new cliProgress.SingleBar({
      format: 'Progress |' + '{bar}' + '| {percentage}% | {value}/{total} Files | ETA: {eta}s | Mem: {memory}MB',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(files.length, 0, {
      memory: 0
    });
  }

  try {
    // Process files in batches
    const result = await service.embedFiles(files, {
      useCache: true,
      showProgress: false // We're handling progress ourselves
    });

    // Update progress
    if (progressBar) {
      const heapUsed = v8.getHeapStatistics().used_heap_size / 1024 / 1024;
      progressBar.update(files.length, {
        memory: heapUsed.toFixed(0)
      });
      progressBar.stop();
    }

    const duration = (Date.now() - startTime) / 1000;

    // Collect failures
    const failures: string[] = [];
    result.results.forEach((r, i) => {
      const file = files[i];
      if (file && (!r.embedding || r.embedding.length === 0)) {
        failures.push(file);
      }
    });

    logger.info('Embedding generation complete', {
      total: result.summary.total,
      cached: result.summary.cached,
      generated: result.summary.generated,
      failed: result.summary.failed,
      duration
    });

    return {
      summary: {
        ...result.summary,
        duration,
        throughput: result.summary.total / duration
      },
      failures
    };
  } catch (error) {
    if (progressBar) {
      progressBar.stop();
    }
    throw error;
  }
}
