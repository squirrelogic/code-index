/**
 * Configuration Service
 *
 * Handles loading, saving, and validation of .codeindex/config.json
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import {
  EmbeddingConfig,
  CONFIG_VERSION,
  serializeEmbeddingConfig,
  deserializeEmbeddingConfig,
  validateEmbeddingConfig
} from '../../models/EmbeddingConfig.js';
import { PRESET_PROFILES } from '../../models/EmbeddingProfile.js';
import { HardwareCapabilities } from '../../models/HardwareCapabilities.js';

export class ConfigService {
  private configPath: string;

  constructor(projectRoot: string) {
    this.configPath = `${projectRoot}/.codeindex/config.json`;
  }

  /**
   * Loads configuration from .codeindex/config.json
   * @returns The parsed configuration
   * @throws Error if config file doesn't exist or is invalid
   */
  async load(): Promise<EmbeddingConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config = deserializeEmbeddingConfig(content);

      if (!validateEmbeddingConfig(config)) {
        throw new Error('Invalid configuration structure');
      }

      // Handle version upgrades if needed
      if (config.version !== CONFIG_VERSION) {
        return await this.upgradeConfig(config);
      }

      return config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(
          'Configuration file not found. Run "code-index init" to initialize the project.'
        );
      }
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Saves configuration to .codeindex/config.json
   * @param config - The configuration to save
   */
  async save(config: EmbeddingConfig): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(dirname(this.configPath), { recursive: true });

      // Update timestamps
      config.updatedAt = new Date();

      // Serialize and write
      const content = serializeEmbeddingConfig(config);
      await fs.writeFile(this.configPath, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Checks if configuration file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates initial configuration with detected hardware
   * @param hardware - Detected hardware capabilities
   * @param profileName - Profile name to use (default: auto-selected)
   */
  async initialize(
    hardware: HardwareCapabilities,
    profileName?: string
  ): Promise<EmbeddingConfig> {
    // Auto-select profile based on hardware if not specified
    const selectedProfileName = profileName || this.selectProfileForHardware(hardware);
    const profile = PRESET_PROFILES[selectedProfileName as keyof typeof PRESET_PROFILES];

    if (!profile) {
      throw new Error(`Invalid profile: ${selectedProfileName}`);
    }

    const config: EmbeddingConfig = {
      version: CONFIG_VERSION,
      profile,
      hardwareCapabilities: hardware,
      fallbackHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.save(config);
    return config;
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   * @returns Validation result with any errors
   */
  validate(config: EmbeddingConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!validateEmbeddingConfig(config)) {
      errors.push('Invalid configuration structure');
    }

    // Validate batch size range
    if (config.profile.batchSize < 1 || config.profile.batchSize > 256) {
      errors.push('Batch size must be between 1 and 256');
    }

    // Validate dimensions
    if (config.profile.dimensions <= 0) {
      errors.push('Dimensions must be greater than 0');
    }

    // Validate model ID format (basic check)
    const modelId = config.profile.model;
    if (!modelId.includes('/') && !modelId.startsWith('.') && !modelId.startsWith('/')) {
      errors.push('Model must be a Hugging Face ID (org/model) or local path');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Handles version upgrades
   */
  private async upgradeConfig(config: EmbeddingConfig): Promise<EmbeddingConfig> {
    // For now, just update the version number
    // In the future, handle actual schema migrations here
    config.version = CONFIG_VERSION;
    config.updatedAt = new Date();
    await this.save(config);
    return config;
  }

  /**
   * Selects appropriate profile based on hardware
   */
  private selectProfileForHardware(hardware: HardwareCapabilities): string {
    // If GPU available
    if (hardware.gpu) {
      // NVIDIA with good compute capability
      if (
        hardware.gpu.vendor === 'NVIDIA' &&
        hardware.gpu.computeCapability &&
        hardware.gpu.computeCapability >= 7.5
      ) {
        return 'performance';
      }

      // Apple Silicon (MPS)
      if (hardware.gpu.vendor === 'Apple') {
        return 'balanced';
      }
    }

    // Low RAM (<8GB) or CPU-only
    if (hardware.totalRAM < 8 * 1024 * 1024 * 1024) {
      return 'light';
    }

    // Default to balanced
    return 'balanced';
  }
}
