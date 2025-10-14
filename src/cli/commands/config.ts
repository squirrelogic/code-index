import { Command } from 'commander';
import { existsSync, readFileSync, accessSync, constants as fsConstants, mkdirSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { ConfigService } from '../../services/config/ConfigService.js';
import { ProfileManager } from '../../services/embedding/ProfileManager.js';
import { EmbeddingCache } from '../../services/cache/EmbeddingCache.js';
import { HardwareDetector } from '../../services/hardware/HardwareDetector.js';
import { PRESET_PROFILES } from '../../models/EmbeddingProfile.js';
import type { EmbeddingConfig } from '../../models/EmbeddingConfig.js';
import type { Quantization, Backend } from '../../models/EmbeddingProfile.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter } from '../utils/output.js';
import {
  validateModelId,
  validateProfileName,
  validateBatchSize,
  validateCacheDir,
  sanitizeInput
} from '../../lib/security-utils.js';

interface ConfigOptions {
  json?: boolean;
}

/**
 * Configuration command implementation
 */
export function createConfigCommand(): Command {
  const cmd = new Command('config');

  cmd
    .description('Manage embedding configuration');

  // config set embedding.profile <value>
  cmd
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (e.g., embedding.profile)')
    .argument('<value>', 'New value')
    .option('--json', 'Output result as JSON')
    .option('--version <version>', 'Model version for embedding.model (default: main)')
    .action(async (key: string, value: string, options: ConfigOptions & { version?: string }) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await setConfigValue(projectRoot, key, value, options, output);

        if (result.success) {
          output.success(`Configuration updated: ${key} = ${value}`, result.details);
          process.exit(0);
        } else {
          output.error(`Failed to update configuration: ${key}`, result.error);
          process.exit(result.exitCode || 1);
        }
      } catch (error: any) {
        output.error('Unexpected error during configuration update', error);
        process.exit(1);
      }
    });

  // config get embedding.profile
  cmd
    .command('get')
    .description('Get a configuration value')
    .argument('<key>', 'Configuration key (e.g., embedding.profile)')
    .option('--json', 'Output result as JSON')
    .action(async (key: string, options: ConfigOptions) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await getConfigValue(projectRoot, key, output);

        if (result.success) {
          output.success(`${key}`, { value: result.value });
          process.exit(0);
        } else {
          output.error(`Failed to get configuration: ${key}`, result.error);
          process.exit(1);
        }
      } catch (error: any) {
        output.error('Unexpected error during configuration get', error);
        process.exit(1);
      }
    });

  // config list
  cmd
    .command('list')
    .description('List all configuration values')
    .option('--json', 'Output result as JSON')
    .action(async (options: ConfigOptions) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await listConfig(projectRoot, output);

        if (result.success) {
          output.success('Configuration', result.config);
          process.exit(0);
        } else {
          output.error('Failed to list configuration', result.error);
          process.exit(1);
        }
      } catch (error: any) {
        output.error('Unexpected error during configuration list', error);
        process.exit(1);
      }
    });

  // config profile list (T072)
  cmd
    .command('profile list')
    .alias('profiles')
    .description('List all available profiles (preset + custom)')
    .option('--json', 'Output result as JSON')
    .action(async (options: ConfigOptions) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await listProfiles(projectRoot, output);

        if (result.success) {
          output.success('Available Profiles', result.profiles);
          process.exit(0);
        } else {
          output.error('Failed to list profiles', result.error);
          process.exit(1);
        }
      } catch (error: any) {
        output.error('Unexpected error during profile list', error);
        process.exit(1);
      }
    });

  // config profile delete (T073)
  cmd
    .command('profile delete <name>')
    .description('Delete a custom profile')
    .option('--json', 'Output result as JSON')
    .action(async (name: string, options: ConfigOptions) => {
      const output = new OutputFormatter(
        options.json ? 'json' as any : 'human' as any
      );

      try {
        const projectRoot = process.cwd();
        const result = await deleteProfile(projectRoot, name, output);

        if (result.success) {
          output.success(`Profile deleted: ${name}`, result.details);
          process.exit(0);
        } else {
          output.error(`Failed to delete profile: ${name}`, result.error);
          process.exit(result.exitCode || 1);
        }
      } catch (error: any) {
        output.error('Unexpected error during profile deletion', error);
        process.exit(1);
      }
    });

  return cmd;
}

interface SetConfigResult {
  success: boolean;
  details?: any;
  error?: Error;
  exitCode?: number;
}

/**
 * Set a configuration value
 */
async function setConfigValue(
  projectRoot: string,
  key: string,
  value: string,
  options: { version?: string },
  output: OutputFormatter
): Promise<SetConfigResult> {
  const logger = new Logger(projectRoot);
  const configService = new ConfigService(projectRoot);

  // Check if project is initialized
  const configPath = join(projectRoot, '.codeindex', 'config.json');
  if (!existsSync(configPath)) {
    return {
      success: false,
      error: new Error('Project not initialized. Run "code-index init" first.'),
      exitCode: 2
    };
  }

  // Load current configuration
  const config = await configService.load();

  // Parse the key
  const keyParts = key.split('.');

  if (keyParts[0] !== 'embedding') {
    return {
      success: false,
      error: new Error(`Invalid configuration key: ${key}. Must start with 'embedding.'`),
      exitCode: 1
    };
  }

  const setting = keyParts[1];

  try {
    switch (setting) {
      case 'profile':
        return await setProfile(projectRoot, config, value, configService, output, logger);

      case 'model':
        return await setModel(projectRoot, config, value, options.version || 'main', configService, output, logger);

      case 'backend':
        return await setBackend(config, value, configService, output, logger);

      case 'quantization':
        return await setQuantization(config, value, configService, output, logger);

      case 'batchSize':
        return await setBatchSize(config, value, configService, output, logger);

      case 'cacheDir':
        return await setCacheDir(projectRoot, config, value, configService, output, logger);

      default:
        return {
          success: false,
          error: new Error(`Unknown configuration setting: ${setting}`),
          exitCode: 1
        };
    }
  } catch (error: any) {
    logger.error('Failed to set configuration', { key, value, error });
    return {
      success: false,
      error,
      exitCode: 1
    };
  }
}

/**
 * Set embedding profile (T046, T070, T075)
 */
async function setProfile(
  projectRoot: string,
  config: EmbeddingConfig,
  profileName: string,
  configService: ConfigService,
  output: OutputFormatter,
  logger: Logger
): Promise<SetConfigResult> {
  logger.info('Setting profile', { profileName });

  // Validate and sanitize profile name (T103, T104)
  const sanitizedName = sanitizeInput(profileName, 50);
  const nameValidation = validateProfileName(sanitizedName);

  if (!nameValidation.valid) {
    return {
      success: false,
      error: new Error(nameValidation.error || 'Invalid profile name'),
      exitCode: 1
    };
  }

  // Load custom profiles into ProfileManager
  const profileManager = new ProfileManager();
  profileManager.loadCustomProfiles(configService.getCustomProfiles(config));

  // Check if profile exists (preset or custom) - T075
  const isPreset = sanitizedName in PRESET_PROFILES;
  const customProfiles = configService.getCustomProfiles(config);
  const isCustom = customProfiles.some(p => p.name === sanitizedName);

  if (!isPreset && !isCustom) {
    const availableProfiles = ['light', 'balanced', 'performance', ...customProfiles.map(p => p.name)];
    return {
      success: false,
      error: new Error(`Profile not found: ${sanitizedName}. Available profiles: ${availableProfiles.join(', ')}`),
      exitCode: 1
    };
  }

  // Get hardware capabilities
  const hardwareDetector = new HardwareDetector();
  const hardware = await hardwareDetector.detect();

  // Get the profile
  const newProfile = profileManager.getProfile(sanitizedName, hardware);

  if (!newProfile) {
    return {
      success: false,
      error: new Error(`Failed to load profile: ${sanitizedName}`),
      exitCode: 1
    };
  }

  // Check hardware compatibility
  const compatibility = profileManager.validateProfileCompatibility(newProfile, hardware);

  if (!compatibility.compatible) {
    output.warning(`Profile "${profileName}" may not be compatible with your hardware:`);
    compatibility.reasons.forEach(reason => {
      output.warning(`  - ${reason}`);
    });
    output.info('Profile will be applied but may fall back to compatible settings.');
  }

  // Detect dimension change
  const oldProfile = config.profile;
  const dimensionChanged = oldProfile.dimensions !== newProfile.dimensions;

  let deletedCount = 0;

  if (dimensionChanged) {
    output.warning(`Dimension change detected: ${oldProfile.dimensions}d → ${newProfile.dimensions}d`);
    output.warning('This will invalidate your embedding cache.');

    // Invalidate cache
    const cacheService = new EmbeddingCache(join(projectRoot, '.codeindex'));
    await cacheService.initialize();
    deletedCount = cacheService.invalidateByDimensions(oldProfile.dimensions);
    cacheService.close();

    logger.info('Cache invalidated due to dimension change', { deleted: deletedCount, oldDimensions: oldProfile.dimensions, newDimensions: newProfile.dimensions });
    output.info(`Invalidated ${deletedCount} cached embedding(s)`);
  }

  // Update configuration
  config.profile = newProfile;
  await configService.save(config);

  logger.info('Profile updated', { profileName, dimensionChanged });

  return {
    success: true,
    details: {
      profile: profileName,
      model: newProfile.model,
      dimensions: newProfile.dimensions,
      device: newProfile.device,
      quantization: newProfile.quantization,
      batch_size: newProfile.batchSize,
      dimension_changed: dimensionChanged,
      cache_invalidated: dimensionChanged ? deletedCount : 0
    }
  };
}

/**
 * Set embedding model (T047)
 */
async function setModel(
  projectRoot: string,
  config: EmbeddingConfig,
  modelId: string,
  modelVersion: string,
  configService: ConfigService,
  output: OutputFormatter,
  logger: Logger
): Promise<SetConfigResult> {
  logger.info('Setting model', { modelId, modelVersion });

  // Sanitize inputs (T104)
  const sanitizedModelId = sanitizeInput(modelId, 500);
  const sanitizedVersion = sanitizeInput(modelVersion, 100);

  // Validate model ID with security checks (T103)
  const validation = validateModelId(sanitizedModelId, projectRoot);

  if (!validation.valid) {
    return {
      success: false,
      error: new Error(validation.error || 'Invalid model ID'),
      exitCode: 1
    };
  }

  // Use the sanitized model ID
  const validatedModelId = validation.sanitized || sanitizedModelId;

  // If local path, validate it exists
  if (validatedModelId.startsWith('/') || validatedModelId.startsWith('./') || isAbsolute(validatedModelId)) {
    if (!existsSync(validatedModelId)) {
      return {
        success: false,
        error: new Error(`Local model path not found: ${validatedModelId}`),
        exitCode: 1
      };
    }
  }

  // TODO: Detect model dimensions by downloading model metadata or reading local config
  // For now, we'll warn the user that they need to rebuild if dimensions change
  output.warning('Unable to auto-detect model dimensions. If dimensions differ from current profile, cache will be invalid.');
  output.info('Run "code-index embed --rebuild" after model download to regenerate embeddings.');

  // Update configuration
  const oldModel = config.profile.model;
  const oldVersion = config.profile.modelVersion;

  config.profile.model = validatedModelId;
  config.profile.modelVersion = sanitizedVersion;

  await configService.save(config);

  logger.info('Model updated', { modelId: validatedModelId, modelVersion: sanitizedVersion, oldModel, oldVersion });

  return {
    success: true,
    details: {
      model: validatedModelId,
      version: sanitizedVersion,
      previous_model: oldModel,
      previous_version: oldVersion,
      note: 'Model dimensions not auto-detected. Run "code-index embed --rebuild" if dimensions changed.'
    }
  };
}

/**
 * Set backend (T048)
 */
async function setBackend(
  config: EmbeddingConfig,
  backend: string,
  configService: ConfigService,
  output: OutputFormatter,
  logger: Logger
): Promise<SetConfigResult> {
  logger.info('Setting backend', { backend });

  // Validate backend value
  const validBackends: Backend[] = ['onnx', 'pytorch'];

  if (!validBackends.includes(backend as Backend)) {
    return {
      success: false,
      error: new Error(`Invalid backend: ${backend}. Must be one of: ${validBackends.join(', ')}`),
      exitCode: 1
    };
  }

  // Check if backend is available
  if (backend === 'pytorch') {
    output.warning('PyTorch backend is not yet implemented. Using ONNX backend.');
    return {
      success: false,
      error: new Error('PyTorch backend not yet implemented'),
      exitCode: 3
    };
  }

  // Update configuration
  const oldBackend = config.profile.backend;
  config.profile.backend = backend as Backend;

  await configService.save(config);

  logger.info('Backend updated', { backend, oldBackend });

  return {
    success: true,
    details: {
      backend,
      previous_backend: oldBackend
    }
  };
}

/**
 * Set quantization (T049)
 */
async function setQuantization(
  config: EmbeddingConfig,
  quantization: string,
  configService: ConfigService,
  output: OutputFormatter,
  logger: Logger
): Promise<SetConfigResult> {
  logger.info('Setting quantization', { quantization });

  // Validate quantization value
  const validQuantizations: Quantization[] = ['int8', 'int4', 'fp16', 'fp32', 'auto'];

  if (!validQuantizations.includes(quantization as Quantization)) {
    return {
      success: false,
      error: new Error(`Invalid quantization: ${quantization}. Must be one of: ${validQuantizations.join(', ')}`),
      exitCode: 1
    };
  }

  // Check compatibility with backend and device
  const device = config.profile.device;
  const backend = config.profile.backend;

  // Validate compatibility
  if (backend === 'onnx') {
    if (['int4', 'int8'].includes(quantization) && device !== 'cpu') {
      output.warning(`${quantization} quantization is optimized for CPU. Your device is set to ${device}.`);
    }
    if (quantization === 'fp16' && device === 'cpu') {
      output.warning('fp16 quantization is not efficient on CPU. Consider int8 instead.');
    }
  }

  // Update configuration
  const oldQuantization = config.profile.quantization;
  config.profile.quantization = quantization as Quantization;

  await configService.save(config);

  logger.info('Quantization updated', { quantization, oldQuantization });

  return {
    success: true,
    details: {
      quantization,
      previous_quantization: oldQuantization,
      device: config.profile.device,
      backend: config.profile.backend
    }
  };
}

/**
 * Set batch size (T050)
 */
async function setBatchSize(
  config: EmbeddingConfig,
  batchSizeStr: string,
  configService: ConfigService,
  _output: OutputFormatter,
  logger: Logger
): Promise<SetConfigResult> {
  logger.info('Setting batch size', { batchSizeStr });

  // Sanitize input (T104)
  const sanitized = sanitizeInput(batchSizeStr, 10);

  // Parse and validate batch size
  const batchSize = parseInt(sanitized, 10);

  // Use validation function (T103, T104)
  const validation = validateBatchSize(batchSize, 1, 256);

  if (!validation.valid) {
    return {
      success: false,
      error: new Error(validation.error || 'Invalid batch size'),
      exitCode: 1
    };
  }

  // Update configuration
  const oldBatchSize = config.profile.batchSize;
  config.profile.batchSize = batchSize;

  await configService.save(config);

  logger.info('Batch size updated', { batchSize, oldBatchSize });

  return {
    success: true,
    details: {
      batch_size: batchSize,
      previous_batch_size: oldBatchSize
    }
  };
}

/**
 * Set cache directory (T051)
 */
async function setCacheDir(
  projectRoot: string,
  config: EmbeddingConfig,
  cacheDir: string,
  configService: ConfigService,
  output: OutputFormatter,
  logger: Logger
): Promise<SetConfigResult> {
  logger.info('Setting cache directory', { cacheDir });

  // Validate cache directory with security checks (T103, T104)
  const validation = validateCacheDir(cacheDir, projectRoot);

  if (!validation.valid) {
    return {
      success: false,
      error: new Error(validation.error || 'Invalid cache directory'),
      exitCode: 1
    };
  }

  const absoluteCacheDir = validation.sanitized || resolve(projectRoot, cacheDir);

  // Check if directory exists, create if not
  if (!existsSync(absoluteCacheDir)) {
    try {
      mkdirSync(absoluteCacheDir, { recursive: true });
      output.info(`Created cache directory: ${absoluteCacheDir}`);
    } catch (error: any) {
      return {
        success: false,
        error: new Error(`Failed to create cache directory: ${error.message}`),
        exitCode: 2
      };
    }
  }

  // Check if directory is writable
  try {
    accessSync(absoluteCacheDir, fsConstants.W_OK);
  } catch {
    return {
      success: false,
      error: new Error(`Cache directory is not writable: ${absoluteCacheDir}`),
      exitCode: 2
    };
  }

  output.info('Note: This does not move existing cache. Embeddings will be regenerated in the new location.');

  // Update configuration
  const oldCacheDir = config.profile.cacheDir;
  config.profile.cacheDir = cacheDir; // Store as-is (relative or absolute)

  await configService.save(config);

  logger.info('Cache directory updated', { cacheDir, absoluteCacheDir, oldCacheDir });

  return {
    success: true,
    details: {
      cache_dir: cacheDir,
      absolute_path: absoluteCacheDir,
      previous_cache_dir: oldCacheDir,
      note: 'Existing cache not moved. Run "code-index embed" to populate new cache.'
    }
  };
}

/**
 * Get a configuration value
 */
async function getConfigValue(
  projectRoot: string,
  key: string,
  _output: OutputFormatter
): Promise<{ success: boolean; value?: any; error?: Error }> {
  const logger = new Logger(projectRoot);

  // Check if project is initialized
  const configPath = join(projectRoot, '.codeindex', 'config.json');
  if (!existsSync(configPath)) {
    return {
      success: false,
      error: new Error('Project not initialized. Run "code-index init" first.')
    };
  }

  // Load configuration
  const configContent = readFileSync(configPath, 'utf-8');
  const config: EmbeddingConfig = JSON.parse(configContent);

  // Parse the key
  const keyParts = key.split('.');

  if (keyParts[0] !== 'embedding') {
    return {
      success: false,
      error: new Error(`Invalid configuration key: ${key}. Must start with 'embedding.'`)
    };
  }

  const setting = keyParts[1];

  let value: any;

  switch (setting) {
    case 'profile':
      value = config.profile.name;
      break;
    case 'model':
      value = config.profile.model;
      break;
    case 'backend':
      value = config.profile.backend;
      break;
    case 'device':
      value = config.profile.device;
      break;
    case 'quantization':
      value = config.profile.quantization;
      break;
    case 'batchSize':
      value = config.profile.batchSize;
      break;
    case 'dimensions':
      value = config.profile.dimensions;
      break;
    case 'cacheDir':
      value = config.profile.cacheDir;
      break;
    default:
      return {
        success: false,
        error: new Error(`Unknown configuration setting: ${setting}`)
      };
  }

  logger.info('Configuration value retrieved', { key, value });

  return {
    success: true,
    value
  };
}

/**
 * List all configuration values
 */
async function listConfig(
  projectRoot: string,
  _output: OutputFormatter
): Promise<{ success: boolean; config?: any; error?: Error }> {
  const logger = new Logger(projectRoot);

  // Check if project is initialized
  const configPath = join(projectRoot, '.codeindex', 'config.json');
  if (!existsSync(configPath)) {
    return {
      success: false,
      error: new Error('Project not initialized. Run "code-index init" first.')
    };
  }

  // Load configuration
  const configContent = readFileSync(configPath, 'utf-8');
  const config: EmbeddingConfig = JSON.parse(configContent);

  logger.info('Configuration listed');

  return {
    success: true,
    config: {
      version: config.version,
      profile: {
        name: config.profile.name,
        model: config.profile.model,
        modelVersion: config.profile.modelVersion,
        backend: config.profile.backend,
        device: config.profile.device,
        quantization: config.profile.quantization,
        batchSize: config.profile.batchSize,
        dimensions: config.profile.dimensions,
        cacheDir: config.profile.cacheDir
      },
      hardware: {
        cpu: config.hardwareCapabilities.cpuModel,
        cores: config.hardwareCapabilities.cpuCores,
        ram: `${(config.hardwareCapabilities.totalRAM / (1024 * 1024 * 1024)).toFixed(1)} GB`,
        gpu: config.hardwareCapabilities.gpu
          ? `${config.hardwareCapabilities.gpu.vendor} ${config.hardwareCapabilities.gpu.name}`
          : 'None'
      },
      updated: config.updatedAt
    }
  };
}

/**
 * List all available profiles (T072)
 */
async function listProfiles(
  projectRoot: string,
  _output: OutputFormatter
): Promise<{ success: boolean; profiles?: any; error?: Error }> {
  const logger = new Logger(projectRoot);

  // Check if project is initialized
  const configPath = join(projectRoot, '.codeindex', 'config.json');
  if (!existsSync(configPath)) {
    return {
      success: false,
      error: new Error('Project not initialized. Run "code-index init" first.')
    };
  }

  // Load configuration
  const configService = new ConfigService(projectRoot);
  const config = await configService.load();

  // Get preset profiles
  const presetProfiles = Object.entries(PRESET_PROFILES).map(([name, profile]) => ({
    name,
    type: 'preset',
    model: profile.model,
    dimensions: profile.dimensions,
    device: profile.device,
    quantization: profile.quantization,
    batchSize: profile.batchSize
  }));

  // Get custom profiles
  const customProfiles = configService.getCustomProfiles(config).map(profile => ({
    name: profile.name,
    type: 'custom',
    model: profile.model,
    dimensions: profile.dimensions,
    device: profile.device,
    quantization: profile.quantization,
    batchSize: profile.batchSize
  }));

  logger.info('Profiles listed', {
    presetCount: presetProfiles.length,
    customCount: customProfiles.length
  });

  return {
    success: true,
    profiles: {
      preset: presetProfiles,
      custom: customProfiles,
      total: presetProfiles.length + customProfiles.length
    }
  };
}

/**
 * Delete a custom profile (T073)
 */
async function deleteProfile(
  projectRoot: string,
  profileName: string,
  output: OutputFormatter
): Promise<SetConfigResult> {
  const logger = new Logger(projectRoot);

  // Check if project is initialized
  const configPath = join(projectRoot, '.codeindex', 'config.json');
  if (!existsSync(configPath)) {
    return {
      success: false,
      error: new Error('Project not initialized. Run "code-index init" first.'),
      exitCode: 2
    };
  }

  // Prevent deleting preset profiles
  if (profileName in PRESET_PROFILES) {
    return {
      success: false,
      error: new Error(`Cannot delete preset profile: ${profileName}`),
      exitCode: 1
    };
  }

  // Load configuration
  const configService = new ConfigService(projectRoot);
  const config = await configService.load();

  // Check if this is the active profile
  if (config.profile.name === profileName) {
    output.warning('Cannot delete the currently active profile');
    output.info('Switch to a different profile first with: code-index config set embedding.profile <profile>');
    return {
      success: false,
      error: new Error(`Cannot delete active profile: ${profileName}`),
      exitCode: 1
    };
  }

  try {
    // Delete the profile
    await configService.deleteCustomProfile(config, profileName);

    logger.info('Profile deleted', { profileName });

    return {
      success: true,
      details: {
        profile: profileName,
        deleted: true
      }
    };
  } catch (error: any) {
    logger.error('Failed to delete profile', { profileName, error });
    return {
      success: false,
      error,
      exitCode: 1
    };
  }
}
