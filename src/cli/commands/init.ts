import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../services/database.js';
import { generateMCPConfig, mcpConfigToString } from '../../lib/mcp-config.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter } from '../utils/output.js';
import type { ProjectConfiguration } from '../../models/project-config.js';
import { DEFAULT_PROJECT_CONFIG } from '../../models/project-config.js';
import { HardwareDetector } from '../../services/hardware/HardwareDetector.js';
import { ProfileManager } from '../../services/embedding/ProfileManager.js';
import type { EmbeddingConfig } from '../../models/EmbeddingConfig.js';

interface InitOptions {
  force?: boolean;
  json?: boolean;
}

/**
 * Initialize command implementation
 */
export function createInitCommand(): Command {
  const cmd = new Command('init');

  cmd
    .description('Initialize code-index in current project')
    .option('-f, --force', 'Reinitialize even if already set up')
    .option('--json', 'Output result as JSON')
    .action(async (options: InitOptions) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await initializeProject(projectRoot, options, output);

        if (result.success) {
          output.success(`Initialized code-index in ${projectRoot}`, {
            directories_created: result.directoriesCreated,
            files_created: result.filesCreated,
            already_existed: result.alreadyExisted
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
  alreadyExisted: string[];
  hardware?: {
    cpu: string;
    cores: number;
    ram: string;
    gpu?: string;
  };
  profile?: {
    name: string;
    model: string;
    dimensions: number;
    device: string;
    quantization: string;
    batchSize: number;
  };
  error?: Error;
}

/**
 * Initializes project with code-index infrastructure
 */
async function initializeProject(
  projectRoot: string,
  options: InitOptions,
  output: OutputFormatter
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    directoriesCreated: [],
    filesCreated: [],
    alreadyExisted: []
  };

  const logger = new Logger(projectRoot);
  logger.info('Initializing code-index', { projectRoot, options });

  // Define paths
  const codeIndexDir = join(projectRoot, '.codeindex');
  const logsDir = join(codeIndexDir, 'logs');
  const claudeDir = join(projectRoot, '.claude');
  const claudeSettingsDir = join(claudeDir, 'settings');
  const claudeHooksDir = join(claudeDir, 'hooks');
  const claudeToolsDir = join(claudeDir, 'tools');
  const mcpConfigPath = join(projectRoot, '.mcp.json');
  const gitignorePath = join(projectRoot, '.gitignore');

  // Check if already initialized
  if (!options.force) {
    if (existsSync(codeIndexDir)) {
      result.alreadyExisted.push('.codeindex/');
    }
    if (existsSync(claudeDir)) {
      result.alreadyExisted.push('.claude/');
    }
    if (existsSync(mcpConfigPath)) {
      result.alreadyExisted.push('.mcp.json');
    }

    if (result.alreadyExisted.length > 0) {
      output.info('Project already initialized. Use --force to reinitialize.', {
        existing_paths: result.alreadyExisted
      });
      return result;
    }
  }

  // Create .codeindex directory structure
  if (!existsSync(codeIndexDir)) {
    mkdirSync(codeIndexDir, { recursive: true });
    result.directoriesCreated.push('.codeindex/');
  }

  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
    result.directoriesCreated.push('.codeindex/logs/');
  }

  // Initialize database
  const db = new DatabaseService(projectRoot);
  db.open();

  // Create project configuration
  const projectName = getProjectName(projectRoot);
  const config: ProjectConfiguration = {
    ...DEFAULT_PROJECT_CONFIG,
    id: randomUUID(),
    projectRoot: resolve(projectRoot),
    name: projectName,
    createdAt: new Date()
  } as ProjectConfiguration;

  // Save configuration to database
  db.saveProjectConfig(config);
  db.close();

  output.info('Database initialized', { path: join(codeIndexDir, 'index.db') });

  // Detect hardware and configure embedding profile
  try {
    logger.info('Starting hardware detection and embedding configuration');
    const hardwareResult = await detectHardwareAndConfigureEmbedding(
      projectRoot,
      codeIndexDir,
      output,
      logger
    );
    result.hardware = hardwareResult.hardware;
    result.profile = hardwareResult.profile;
    logger.info('Hardware detection and configuration complete', {
      hardware: hardwareResult.hardware,
      profile: hardwareResult.profile
    });
  } catch (error) {
    logger.error('Hardware detection failed, using default configuration', { error });
    output.warning('Hardware detection failed - using CPU-only configuration');

    // Create fallback configuration
    try {
      const fallbackConfig = await createFallbackConfiguration(codeIndexDir, logger);
      result.hardware = fallbackConfig.hardware;
      result.profile = fallbackConfig.profile;
      logger.info('Fallback configuration created successfully');
    } catch (fallbackError) {
      logger.error('Failed to create fallback configuration', { error: fallbackError });
    }
  }

  // Create .claude directory structure
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
    result.directoriesCreated.push('.claude/');
  }

  if (!existsSync(claudeSettingsDir)) {
    mkdirSync(claudeSettingsDir, { recursive: true });
    result.directoriesCreated.push('.claude/settings/');
  }

  if (!existsSync(claudeHooksDir)) {
    mkdirSync(claudeHooksDir, { recursive: true });
    result.directoriesCreated.push('.claude/hooks/');
  }

  if (!existsSync(claudeToolsDir)) {
    mkdirSync(claudeToolsDir, { recursive: true });
    result.directoriesCreated.push('.claude/tools/');
  }

  // Create default settings file
  const settingsPath = join(claudeSettingsDir, 'code-index.json');
  if (!existsSync(settingsPath) || options.force) {
    const defaultSettings = {
      autoIndex: true,
      excludePatterns: [],
      includePatterns: [],
      maxFileSize: 10485760, // 10MB
      followSymlinks: false
    };
    writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    result.filesCreated.push('.claude/settings/code-index.json');
  }

  // Create .mcp.json
  if (!existsSync(mcpConfigPath) || options.force) {
    const mcpConfig = generateMCPConfig(projectRoot);
    writeFileSync(mcpConfigPath, mcpConfigToString(mcpConfig));
    result.filesCreated.push('.mcp.json');
  } else {
    result.alreadyExisted.push('.mcp.json');
  }

  // Update .gitignore
  updateGitignore(gitignorePath, output);

  logger.info('Initialization complete', result);

  return result;
}

/**
 * Gets project name from package.json or directory name
 */
function getProjectName(projectRoot: string): string {
  const packageJsonPath = join(projectRoot, 'package.json');

  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name) {
        return packageJson.name;
      }
    } catch {
      // Fall through to use directory name
    }
  }

  return basename(projectRoot);
}

/**
 * Updates .gitignore to exclude code-index files
 */
function updateGitignore(gitignorePath: string, output: OutputFormatter): void {
  const patternsToAdd = [
    '# Code-index',
    '.codeindex/logs/',
    '.codeindex/*.log',
    '.codeindex/index.db-wal',
    '.codeindex/index.db-shm'
  ];

  let gitignoreContent = '';
  let needsUpdate = false;

  if (existsSync(gitignorePath)) {
    gitignoreContent = readFileSync(gitignorePath, 'utf8');

    // Check if patterns already exist
    for (const pattern of patternsToAdd) {
      if (pattern.startsWith('#')) continue;
      if (!gitignoreContent.includes(pattern)) {
        needsUpdate = true;
        break;
      }
    }
  } else {
    needsUpdate = true;
  }

  if (needsUpdate) {
    // Add a newline if file doesn't end with one
    if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
      gitignoreContent += '\n';
    }

    // Add our patterns
    if (gitignoreContent) {
      gitignoreContent += '\n';
    }
    gitignoreContent += patternsToAdd.join('\n') + '\n';

    writeFileSync(gitignorePath, gitignoreContent);
    output.info('Updated .gitignore');
  }
}

/**
 * Detect hardware capabilities and configure embedding profile
 */
async function detectHardwareAndConfigureEmbedding(
  _projectRoot: string,
  codeIndexDir: string,
  output: OutputFormatter,
  logger: Logger
): Promise<{
  hardware: {
    cpu: string;
    cores: number;
    ram: string;
    gpu?: string;
  };
  profile: {
    name: string;
    model: string;
    dimensions: number;
    device: string;
    quantization: string;
    batchSize: number;
  };
}> {
  logger.info('Starting hardware detection');
  output.info('Detecting hardware capabilities...');

  // Detect hardware
  const hardwareDetector = new HardwareDetector();
  logger.debug('Hardware detector initialized');

  const capabilities = await hardwareDetector.detect();
  logger.info('Hardware detection complete', {
    cpuCores: capabilities.cpuCores,
    totalRAMGB: (capabilities.totalRAM / (1024 * 1024 * 1024)).toFixed(2),
    platform: capabilities.platform,
    arch: capabilities.arch,
    hasGPU: !!capabilities.gpu,
    gpuVendor: capabilities.gpu?.vendor,
    onnxProviders: capabilities.onnxProviders
  });

  // Format hardware info for display
  const ramGB = (capabilities.totalRAM / (1024 * 1024 * 1024)).toFixed(1);
  const hardwareInfo = {
    cpu: capabilities.cpuModel,
    cores: capabilities.cpuCores,
    ram: `${ramGB} GB`,
    gpu: capabilities.gpu
      ? `${capabilities.gpu.vendor} ${capabilities.gpu.name}`
      : undefined
  };

  // Display hardware summary
  output.success('Hardware detected', {
    cpu: `${hardwareInfo.cpu} (${hardwareInfo.cores} cores)`,
    ram: hardwareInfo.ram,
    gpu: hardwareInfo.gpu || 'None'
  });

  // Select optimal embedding profile
  logger.info('Selecting optimal embedding profile');
  const profileManager = new ProfileManager();
  const selectedProfile = profileManager.selectProfile(capabilities);

  logger.info('Profile selection complete', {
    profileName: selectedProfile.name,
    model: selectedProfile.model,
    device: selectedProfile.device,
    quantization: selectedProfile.quantization,
    batchSize: selectedProfile.batchSize,
    dimensions: selectedProfile.dimensions
  });

  // Display profile summary
  output.success(`Selected profile: ${selectedProfile.name}`, {
    model: selectedProfile.model,
    dimensions: `${selectedProfile.dimensions}d`,
    device: selectedProfile.device,
    quantization: selectedProfile.quantization,
    batch_size: selectedProfile.batchSize
  });

  // Create embedding configuration
  const embeddingConfig: EmbeddingConfig = {
    version: '1.0.0',
    profile: selectedProfile,
    hardwareCapabilities: capabilities,
    fallbackHistory: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Save configuration to .codeindex/config.json
  const configPath = join(codeIndexDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(embeddingConfig, null, 2));
  logger.info('Configuration saved', { path: configPath });

  return {
    hardware: hardwareInfo,
    profile: {
      name: selectedProfile.name,
      model: selectedProfile.model,
      dimensions: selectedProfile.dimensions,
      device: selectedProfile.device,
      quantization: selectedProfile.quantization,
      batchSize: selectedProfile.batchSize
    }
  };
}

/**
 * Create fallback configuration when hardware detection fails
 */
async function createFallbackConfiguration(
  codeIndexDir: string,
  logger: Logger
): Promise<{
  hardware: {
    cpu: string;
    cores: number;
    ram: string;
    gpu?: string;
  };
  profile: {
    name: string;
    model: string;
    dimensions: number;
    device: string;
    quantization: string;
    batchSize: number;
  };
}> {
  logger.info('Creating fallback configuration (CPU-only, light profile)');

  const hardwareDetector = new HardwareDetector();
  const capabilities = await hardwareDetector.detect(); // Uses safe defaults

  const profileManager = new ProfileManager();

  // Force light profile for fallback
  const lightProfile = profileManager.getProfile('light', capabilities);
  if (!lightProfile) {
    throw new Error('Failed to load light profile');
  }

  const embeddingConfig: EmbeddingConfig = {
    version: '1.0.0',
    profile: lightProfile,
    hardwareCapabilities: capabilities,
    fallbackHistory: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const configPath = join(codeIndexDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(embeddingConfig, null, 2));
  logger.info('Fallback configuration saved', { path: configPath });

  return {
    hardware: {
      cpu: 'Unknown CPU',
      cores: 2,
      ram: '4 GB',
      gpu: undefined
    },
    profile: {
      name: lightProfile.name,
      model: lightProfile.model,
      dimensions: lightProfile.dimensions,
      device: lightProfile.device,
      quantization: lightProfile.quantization,
      batchSize: lightProfile.batchSize
    }
  };
}