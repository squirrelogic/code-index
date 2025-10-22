/**
 * Simplified Init Command
 *
 * Sets up .codeindex directory structure and downloads gte-small.onnx model.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, copyFileSync, chmodSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
            gitignore_updated: result.gitignoreUpdated,
            hooks_installed: result.hooksInstalled,
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
  gitignoreUpdated: boolean;
  hooksInstalled: number;
  error?: any;
}

/**
 * Find the package root directory (where claude-hooks is located)
 */
function findPackageRoot(): string {
  // Get the directory of this file
  const currentFile = fileURLToPath(import.meta.url);
  let currentDir = dirname(currentFile);

  // Navigate up from dist/cli/commands to package root
  // dist/cli/commands/init.js -> dist/cli/commands -> dist/cli -> dist -> package root
  const packageRoot = join(currentDir, '..', '..', '..');

  return packageRoot;
}

/**
 * Install Claude Code hooks
 */
function installHooks(projectRoot: string, force: boolean): number {
  const packageRoot = findPackageRoot();
  const claudeHooksDir = join(packageRoot, 'claude-hooks');

  // Check if claude-hooks directory exists in package
  if (!existsSync(claudeHooksDir)) {
    console.log('Note: claude-hooks directory not found in package, skipping hook installation');
    return 0;
  }

  // Determine OS-specific hook directory
  const platform = process.platform;
  const hookSourceDir = platform === 'win32'
    ? join(claudeHooksDir, 'hooks', 'windows')
    : join(claudeHooksDir, 'hooks', 'unix');

  if (!existsSync(hookSourceDir)) {
    console.log(`Note: Hook directory not found for platform ${platform}, skipping`);
    return 0;
  }

  // Create .claude/hooks directory
  const claudeDir = join(projectRoot, '.claude');
  const hooksTargetDir = join(claudeDir, 'hooks');

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }
  if (!existsSync(hooksTargetDir)) {
    mkdirSync(hooksTargetDir, { recursive: true });
  }

  let hooksInstalled = 0;

  // Copy hook files
  const hookFiles = readdirSync(hookSourceDir).filter(f => f.endsWith('.sh') || f.endsWith('.ps1'));

  for (const hookFile of hookFiles) {
    const sourcePath = join(hookSourceDir, hookFile);
    const targetPath = join(hooksTargetDir, hookFile);

    // Skip if exists and not force
    if (existsSync(targetPath) && !force) {
      continue;
    }

    try {
      copyFileSync(sourcePath, targetPath);

      // Make executable on Unix
      if (platform !== 'win32' && hookFile.endsWith('.sh')) {
        chmodSync(targetPath, 0o755);
      }

      hooksInstalled++;
    } catch (error) {
      console.error(`Warning: Failed to install hook ${hookFile}:`, error);
    }
  }

  // Copy common library for Unix
  if (platform !== 'win32') {
    const commonLibSource = join(claudeHooksDir, 'lib', 'unix', 'common.sh');
    const commonLibTarget = join(hooksTargetDir, 'common.sh');

    if (existsSync(commonLibSource)) {
      try {
        copyFileSync(commonLibSource, commonLibTarget);
        chmodSync(commonLibTarget, 0o755);
      } catch (error) {
        console.error('Warning: Failed to install common.sh library:', error);
      }
    }
  }

  // Copy policies template if doesn't exist
  const policiesSource = join(claudeHooksDir, 'templates', 'policies.json');
  const policiesTarget = join(claudeDir, 'policies.json');

  if (existsSync(policiesSource) && !existsSync(policiesTarget)) {
    try {
      copyFileSync(policiesSource, policiesTarget);
    } catch (error) {
      console.error('Warning: Failed to install policies.json:', error);
    }
  }

  // Update or create settings.json to register hooks
  const settingsSource = join(claudeHooksDir, 'templates', 'settings.json');
  const settingsTarget = join(claudeDir, 'settings.json');

  if (existsSync(settingsSource) && !existsSync(settingsTarget)) {
    try {
      copyFileSync(settingsSource, settingsTarget);
    } catch (error) {
      console.error('Warning: Failed to install settings.json:', error);
    }
  }

  return hooksInstalled;
}

/**
 * Update .gitignore with code-index paths
 */
function updateGitignore(projectRoot: string): boolean {
  const gitignorePath = join(projectRoot, '.gitignore');
  const codeIndexPaths = [
    '',
    '# Code-index specific',
    '.codeindex/logs/',
    '.codeindex/*.log',
    '.codeindex/index.db-wal',
    '.codeindex/index.db-shm',
    '.codeindex/models/',
    '.codeindex/cache/',
    '.codeindex/ast/',
    '.codeindex/vectors/',
  ];

  try {
    let gitignoreContent = '';
    if (existsSync(gitignorePath)) {
      gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    }

    // Check if code-index section already exists
    if (gitignoreContent.includes('# Code-index specific')) {
      return false; // Already updated
    }

    // Ensure file ends with newline before appending
    if (gitignoreContent.length > 0 && !gitignoreContent.endsWith('\n')) {
      gitignoreContent += '\n';
    }

    // Append code-index section
    const codeIndexSection = codeIndexPaths.join('\n') + '\n';
    appendFileSync(gitignorePath, codeIndexSection);
    return true;
  } catch (error) {
    console.error(`Warning: Could not update .gitignore: ${error}`);
    return false;
  }
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
    gitignoreUpdated: false,
    hooksInstalled: 0,
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

    // Update .gitignore with code-index paths
    result.gitignoreUpdated = updateGitignore(projectRoot);

    // Install Claude Code hooks
    result.hooksInstalled = installHooks(projectRoot, options.force || false);

    result.success = true;
    return result;
  } catch (error) {
    result.error = error;
    return result;
  }
}
