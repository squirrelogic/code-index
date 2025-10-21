/**
 * Simplified Init Command
 *
 * Sets up .codeindex directory structure and downloads gte-small.onnx model.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from '../../services/database.js';
import { downloadGteSmallModel } from '../../services/onnx-embedder.js';
import { generateMCPConfig, mcpConfigToString } from '../../lib/mcp-config.js';
import { OutputFormatter } from '../utils/output.js';
import { DEFAULT_HYBRID_CONFIG } from '../../services/hybrid-index.js';
import { DEFAULT_NGRAM_CONFIG } from '../../services/sparse-vector.js';

interface InitOptions {
  force?: boolean;
  json?: boolean;
  model?: string;
}

/**
 * Initialize command implementation
 */
export function createInitCommand(): Command {
  const cmd = new Command('init');

  cmd
    .description('Initialize code-index with hybrid sparse+dense search')
    .option('-f, --force', 'Reinitialize even if already set up')
    .option('--json', 'Output result as JSON')
    .option('--model <name>', 'Model to use (default: gte-small)', 'gte-small')
    .action(async (options: InitOptions) => {
      const output = new OutputFormatter(
        options.json ? ('json' as any) : ('human' as any)
      );

      try {
        const projectRoot = process.cwd();
        const result = await initializeProject(projectRoot, options);

        if (result.success) {
          output.success(`Initialized code-index in ${projectRoot}`, {
            directories_created: result.directoriesCreated,
            files_created: result.filesCreated,
            model_downloaded: result.modelDownloaded,
          });
        } else {
          output.error('Failed to initialize code-index', result.error);
          process.exit(1);
        }
      } catch (error: any) {
        output.error('Unexpected error during initialization', error);
        process.exit(1);
      }
    });

  return cmd;
}

interface InitResult {
  success: boolean;
  directoriesCreated: string[];
  filesCreated: string[];
  modelDownloaded: boolean;
  error?: any;
}

async function initializeProject(
  projectRoot: string,
  options: InitOptions
): Promise<InitResult> {
  const result: InitResult = {
    success: false,
    directoriesCreated: [],
    filesCreated: [],
    modelDownloaded: false,
  };

  try {
    const codeIndexDir = join(projectRoot, '.codeindex');

    // Check if already initialized
    if (existsSync(codeIndexDir) && !options.force) {
      throw new Error(
        'Code-index already initialized. Use --force to reinitialize.'
      );
    }

    // Create directory structure
    const directories = [
      codeIndexDir,
      join(codeIndexDir, 'ast'),
      join(codeIndexDir, 'vectors'),
      join(codeIndexDir, 'models'),
      join(codeIndexDir, 'logs'),
    ];

    for (const dir of directories) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        result.directoriesCreated.push(dir);
      }
    }

    // Create config.json with hybrid settings
    const configPath = join(codeIndexDir, 'config.json');
    const config = {
      version: '1.0.0',
      hybrid: {
        denseWeight: DEFAULT_HYBRID_CONFIG.denseWeight,
        sparseWeight: DEFAULT_HYBRID_CONFIG.sparseWeight,
        model: options.model || 'gte-small',
        dimensions: 384, // gte-small embedding dimension
      },
      ngram: {
        minGram: DEFAULT_NGRAM_CONFIG.minGram,
        maxGram: DEFAULT_NGRAM_CONFIG.maxGram,
        numFeatures: DEFAULT_NGRAM_CONFIG.numFeatures,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    result.filesCreated.push(configPath);

    // Initialize database
    const dbPath = join(codeIndexDir, 'index.db');
    const db = new DatabaseService(dbPath);
    db.close();
    result.filesCreated.push(dbPath);

    // Download gte-small.onnx model if not exists
    const modelPath = join(codeIndexDir, 'models', 'gte-small.onnx');
    if (!existsSync(modelPath) || options.force) {
      console.log('Downloading gte-small.onnx model...');
      await downloadGteSmallModel(modelPath);
      result.modelDownloaded = true;
    } else {
      console.log('Model already exists, skipping download');
    }

    // Initialize empty vector index files
    const vectorsDir = join(codeIndexDir, 'vectors');
    const emptyIds = JSON.stringify([], null, 2);
    const emptyMeta = JSON.stringify(
      {
        dim: 384,
        numFeatures: DEFAULT_NGRAM_CONFIG.numFeatures,
        numItems: 0,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    );

    writeFileSync(join(vectorsDir, 'ids.json'), emptyIds);
    writeFileSync(join(vectorsDir, 'meta.json'), emptyMeta);
    result.filesCreated.push(
      join(vectorsDir, 'ids.json'),
      join(vectorsDir, 'meta.json')
    );

    // Generate .mcp.json for MCP integration
    const mcpConfigPath = join(projectRoot, '.mcp.json');
    if (!existsSync(mcpConfigPath) || options.force) {
      const mcpConfig = generateMCPConfig(projectRoot);
      const mcpConfigContent = mcpConfigToString(mcpConfig);
      writeFileSync(mcpConfigPath, mcpConfigContent);
      result.filesCreated.push(mcpConfigPath);
    }

    result.success = true;
    return result;
  } catch (error) {
    result.error = error;
    return result;
  }
}
