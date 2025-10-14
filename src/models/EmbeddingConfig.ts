/**
 * Embedding Config Model
 *
 * Represents the persisted configuration state.
 */

import { EmbeddingProfile } from './EmbeddingProfile.js';
import { HardwareCapabilities } from './HardwareCapabilities.js';
import { FallbackEvent } from './FallbackEvent.js';

export interface EmbeddingConfig {
  /** Config schema version (e.g., "1.0.0") */
  version: string;

  /** Active profile configuration */
  profile: EmbeddingProfile;

  /** Last detected hardware */
  hardwareCapabilities: HardwareCapabilities;

  /** Custom user-defined profiles (T074) */
  customProfiles?: EmbeddingProfile[];

  /** History of fallback actions (last 10 events) */
  fallbackHistory: FallbackEvent[];

  /** When config was created */
  createdAt: Date;

  /** When config was last modified */
  updatedAt: Date;
}

/**
 * Default configuration version
 */
export const CONFIG_VERSION = '1.0.0';

/**
 * Validates embedding config structure
 */
export function validateEmbeddingConfig(
  config: Partial<EmbeddingConfig>
): config is EmbeddingConfig {
  return (
    typeof config.version === 'string' &&
    config.version.length > 0 &&
    typeof config.profile === 'object' &&
    config.profile !== null &&
    typeof config.hardwareCapabilities === 'object' &&
    config.hardwareCapabilities !== null &&
    Array.isArray(config.fallbackHistory) &&
    config.createdAt instanceof Date &&
    config.updatedAt instanceof Date
  );
}

/**
 * Serializes config to JSON for storage (T074 - includes custom profiles)
 */
export function serializeEmbeddingConfig(config: EmbeddingConfig): string {
  return JSON.stringify(
    {
      version: config.version,
      profile: config.profile,
      hardwareCapabilities: {
        ...config.hardwareCapabilities,
        detectedAt: config.hardwareCapabilities.detectedAt.toISOString()
      },
      customProfiles: config.customProfiles || [],
      fallbackHistory: config.fallbackHistory.map((event) => ({
        ...event,
        timestamp: event.timestamp.toISOString()
      })),
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString()
    },
    null,
    2
  );
}

/**
 * Deserializes config from JSON
 */
export function deserializeEmbeddingConfig(json: string): EmbeddingConfig {
  const obj = JSON.parse(json);
  return {
    ...obj,
    hardwareCapabilities: {
      ...obj.hardwareCapabilities,
      detectedAt: new Date(obj.hardwareCapabilities.detectedAt)
    },
    fallbackHistory: obj.fallbackHistory.map((event: any) => ({
      ...event,
      timestamp: new Date(event.timestamp)
    })),
    createdAt: new Date(obj.createdAt),
    updatedAt: new Date(obj.updatedAt)
  };
}
