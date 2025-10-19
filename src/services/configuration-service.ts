/**
 * Configuration service for hybrid ranking system
 * Handles loading, validation, and hot-reload of ranking configuration
 *
 * @module configuration-service
 */

import { existsSync, readFileSync, watch, FSWatcher } from 'fs';
import { join } from 'path';
import { DEFAULT_RANKING_CONFIG } from '../constants/ranking-constants.js';
import { validateRankingConfig, hasExtremeWeights } from '../lib/ranking-utils.js';
import type { RankingConfig } from '../models/ranking-config.js';

/**
 * Configuration service manages ranking configuration with hot-reload support
 *
 * Features:
 * - Load configuration from JSON file
 * - Validate configuration on load
 * - Hot-reload when file changes (debounced)
 * - Detect extreme weights and generate warnings
 * - Fallback to default config on errors
 */
export class ConfigurationService {
  private config: RankingConfig;
  private configPath?: string;
  private watcher?: FSWatcher;
  private warnings: string[] = [];
  private debounceTimer?: NodeJS.Timeout;
  private changeListeners: Array<(config: RankingConfig) => void> = [];

  /**
   * Create a new ConfigurationService
   *
   * @param configPath - Optional path to config file (defaults to .codeindex/ranking-config.json)
   */
  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfig();
    this.detectExtremeWeights();
  }

  /**
   * Get the current ranking configuration
   *
   * @returns Current ranking configuration
   */
  getConfig(): RankingConfig {
    return this.config;
  }

  /**
   * Get configuration warnings (e.g., extreme weights)
   *
   * @returns Array of warning messages
   */
  getWarnings(): string[] {
    return this.warnings;
  }

  /**
   * Register a callback to be notified when config changes
   *
   * @param listener - Callback function
   */
  onConfigChange(listener: (config: RankingConfig) => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * Start watching config file for changes
   */
  startWatching(): void {
    if (this.watcher || !this.configPath) {
      return;
    }

    if (!existsSync(this.configPath)) {
      // Can't watch a file that doesn't exist
      return;
    }

    this.watcher = watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        this.handleFileChange();
      }
    });
  }

  /**
   * Stop watching config file
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /**
   * Load configuration from file or return default
   *
   * @returns Ranking configuration
   */
  private loadConfig(): RankingConfig {
    // If no config path or file doesn't exist, use default
    if (!this.configPath || !existsSync(this.configPath)) {
      return { ...DEFAULT_RANKING_CONFIG };
    }

    try {
      const fileContent = readFileSync(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(fileContent);

      // Validate configuration
      const validationResult = validateRankingConfig(parsedConfig);

      if (validationResult.isErr()) {
        console.warn(
          `[ConfigurationService] Invalid configuration in ${this.configPath}: ${validationResult.error.message}`
        );
        console.warn('[ConfigurationService] Falling back to default configuration');
        return { ...DEFAULT_RANKING_CONFIG };
      }

      return validationResult.value;
    } catch (error) {
      console.warn(
        `[ConfigurationService] Failed to load configuration from ${this.configPath}: ${error instanceof Error ? error.message : String(error)}`
      );
      console.warn('[ConfigurationService] Falling back to default configuration');
      return { ...DEFAULT_RANKING_CONFIG };
    }
  }

  /**
   * Detect extreme weights and generate warnings
   */
  private detectExtremeWeights(): void {
    this.warnings = [];

    if (hasExtremeWeights(this.config)) {
      const { alpha, beta } = this.config.fusion;

      if (alpha === 0) {
        this.warnings.push('Extreme weight detected: alpha = 0 (lexical search disabled)');
      }
      if (beta === 0) {
        this.warnings.push('Extreme weight detected: beta = 0 (vector search disabled)');
      }
      if (alpha > 0.9) {
        this.warnings.push('Extreme weight detected: alpha > 0.9 (lexical heavily favored)');
      }
      if (beta > 0.9) {
        this.warnings.push('Extreme weight detected: beta > 0.9 (vector heavily favored)');
      }
    }

    // Log warnings
    if (this.warnings.length > 0) {
      console.warn('[ConfigurationService] Configuration warnings:');
      for (const warning of this.warnings) {
        console.warn(`  • ${warning}`);
      }
    }
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(): void {
    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce for 100ms to avoid rapid reloads
    this.debounceTimer = setTimeout(() => {
      this.reloadConfig();
    }, 100);
  }

  /**
   * Reload configuration from file
   */
  private reloadConfig(): void {
    const newConfig = this.loadConfig();

    // Validate new config
    const validationResult = validateRankingConfig(newConfig);

    if (validationResult.isErr()) {
      console.warn('[ConfigurationService] Failed to reload configuration: validation error');
      console.warn('[ConfigurationService] Keeping previous configuration');
      return;
    }

    this.config = newConfig;
    this.detectExtremeWeights();

    console.info('[ConfigurationService] Configuration reloaded successfully');

    // Notify listeners
    for (const listener of this.changeListeners) {
      listener(this.config);
    }
  }

  /**
   * Get default config path
   *
   * @returns Default path to ranking-config.json
   */
  private getDefaultConfigPath(): string {
    return join(process.cwd(), '.codeindex', 'ranking-config.json');
  }
}

// Singleton instance for global access
let globalInstance: ConfigurationService | undefined;

/**
 * Get the global ConfigurationService instance
 *
 * @param configPath - Optional custom config path
 * @returns ConfigurationService instance
 */
export function getConfigurationService(configPath?: string): ConfigurationService {
  if (!globalInstance || configPath) {
    globalInstance = new ConfigurationService(configPath);
  }
  return globalInstance;
}

/**
 * Reset the global instance (useful for testing)
 */
export function resetConfigurationService(): void {
  if (globalInstance) {
    globalInstance.stopWatching();
    globalInstance = undefined;
  }
}
