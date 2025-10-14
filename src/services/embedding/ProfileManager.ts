import type { HardwareCapabilities } from '../../models/HardwareCapabilities.js';
import type { EmbeddingProfile, Device, Quantization } from '../../models/EmbeddingProfile.js';
import { PRESET_PROFILES } from '../../models/EmbeddingProfile.js';
import { CapabilityEvaluator } from '../hardware/CapabilityEvaluator.js';

/**
 * ProfileManager service - Manages embedding profiles and hardware-based selection
 *
 * This service provides:
 * - Automatic profile selection based on detected hardware
 * - Resolution of 'auto' values (device, quantization) based on capabilities
 * - Custom profile management (load, validate, store)
 * - Profile optimization for specific hardware configurations
 *
 * Profile selection logic:
 * - CPU-only → light profile (int8 quantization)
 * - Apple Silicon MPS → balanced profile (fp16 quantization)
 * - NVIDIA CUDA (compute ≥7.5) → performance profile (fp16 quantization)
 * - NVIDIA CUDA (compute <7.5) → balanced profile (fp16 quantization)
 */
export class ProfileManager {
  private capabilityEvaluator: CapabilityEvaluator;
  private customProfiles: Map<string, EmbeddingProfile> = new Map();

  constructor() {
    this.capabilityEvaluator = new CapabilityEvaluator();
  }

  /**
   * Automatically select the optimal profile based on hardware capabilities
   *
   * Selection logic:
   * 1. Evaluate hardware capabilities
   * 2. Select best compatible profile (light/balanced/performance)
   * 3. Resolve 'auto' values (device, quantization)
   * 4. Adjust batch size based on available RAM
   *
   * @param capabilities Detected hardware capabilities
   * @returns Fully configured embedding profile
   */
  selectProfile(capabilities: HardwareCapabilities): EmbeddingProfile {
    // Get the best profile for this hardware
    const profileName = this.capabilityEvaluator.getBestProfile(capabilities);
    const baseProfile = PRESET_PROFILES[profileName];

    // Resolve auto values and optimize for hardware
    return this.resolveProfile(baseProfile, capabilities);
  }

  /**
   * Get a profile by name (preset or custom)
   *
   * @param name Profile name
   * @param capabilities Hardware capabilities for resolving 'auto' values
   * @returns Resolved embedding profile or null if not found
   */
  getProfile(name: string, capabilities: HardwareCapabilities): EmbeddingProfile | null {
    // Check preset profiles first
    if (name in PRESET_PROFILES) {
      const profile = PRESET_PROFILES[name as 'light' | 'balanced' | 'performance'];
      return this.resolveProfile(profile, capabilities);
    }

    // Check custom profiles
    const customProfile = this.customProfiles.get(name);
    if (customProfile) {
      return this.resolveProfile(customProfile, capabilities);
    }

    return null;
  }

  /**
   * List all available profiles (preset + custom)
   *
   * @returns Array of profile names
   */
  listProfiles(): string[] {
    const presetNames = Object.keys(PRESET_PROFILES);
    const customNames = Array.from(this.customProfiles.keys());
    return [...presetNames, ...customNames];
  }

  /**
   * Add a custom profile
   *
   * @param profile Custom embedding profile
   * @throws Error if profile name conflicts with preset or validation fails
   */
  addCustomProfile(profile: EmbeddingProfile): void {
    // Prevent overriding preset profiles
    if (profile.name in PRESET_PROFILES) {
      throw new Error(`Cannot create custom profile with preset name: ${profile.name}`);
    }

    // Validate profile structure
    if (profile.batchSize < 1 || profile.batchSize > 256) {
      throw new Error(`Invalid batch size: ${profile.batchSize} (must be 1-256)`);
    }

    if (profile.dimensions <= 0) {
      throw new Error(`Invalid dimensions: ${profile.dimensions} (must be > 0)`);
    }

    // Store custom profile
    this.customProfiles.set(profile.name, profile);
  }

  /**
   * Remove a custom profile
   *
   * @param name Profile name
   * @throws Error if trying to delete a preset profile
   */
  deleteCustomProfile(name: string): void {
    // Prevent deleting preset profiles
    if (name in PRESET_PROFILES) {
      throw new Error(`Cannot delete preset profile: ${name}`);
    }

    if (!this.customProfiles.has(name)) {
      throw new Error(`Custom profile not found: ${name}`);
    }

    this.customProfiles.delete(name);
  }

  /**
   * Load custom profiles from storage
   *
   * @param profiles Array of custom profiles to load
   */
  loadCustomProfiles(profiles: EmbeddingProfile[]): void {
    for (const profile of profiles) {
      // Skip preset profiles
      if (profile.name in PRESET_PROFILES) {
        continue;
      }

      this.customProfiles.set(profile.name, profile);
    }
  }

  /**
   * Get all custom profiles
   *
   * @returns Array of custom profiles
   */
  getCustomProfiles(): EmbeddingProfile[] {
    return Array.from(this.customProfiles.values());
  }

  /**
   * Resolve 'auto' values in a profile based on hardware capabilities
   *
   * Resolves:
   * - device: 'auto' → 'cpu' | 'mps' | 'cuda' (based on best available)
   * - quantization: 'auto' → 'int8' | 'fp16' (int8 for CPU, fp16 for GPU)
   * - batchSize: Adjusts based on available RAM if needed
   *
   * @param profile Profile with possible 'auto' values
   * @param capabilities Detected hardware capabilities
   * @returns Fully resolved profile
   */
  private resolveProfile(
    profile: EmbeddingProfile,
    capabilities: HardwareCapabilities
  ): EmbeddingProfile {
    const resolved: EmbeddingProfile = { ...profile };

    // Resolve device
    if (resolved.device === 'auto') {
      resolved.device = this.capabilityEvaluator.getBestDevice(capabilities);
    }

    // Resolve quantization
    if (resolved.quantization === 'auto') {
      resolved.quantization = this.resolveQuantization(resolved.device);
    }

    // Adjust batch size based on available RAM
    const recommendedBatchSize = this.capabilityEvaluator.calculateBatchSize(
      capabilities,
      profile.name as 'light' | 'balanced' | 'performance'
    );

    // Use recommended batch size if profile batch size is too large
    if (resolved.batchSize > recommendedBatchSize) {
      resolved.batchSize = recommendedBatchSize;
    }

    return resolved;
  }

  /**
   * Resolve quantization based on device type
   *
   * Logic:
   * - CPU: int8 quantization (best CPU performance)
   * - MPS: fp16 quantization (Apple Silicon supports fp16 well)
   * - CUDA: fp16 quantization (GPU supports fp16 efficiently)
   *
   * @param device Target device
   * @returns Resolved quantization level
   */
  private resolveQuantization(device: Device): Quantization {
    if (device === 'cpu') {
      return 'int8';
    }

    // For GPU devices (MPS, CUDA), use fp16
    if (device === 'mps' || device === 'cuda') {
      return 'fp16';
    }

    // Fallback to fp32 for 'auto' or unknown
    return 'fp32';
  }

  /**
   * Validate if a profile is compatible with hardware capabilities
   *
   * @param profile Profile to validate
   * @param capabilities Hardware capabilities
   * @returns Validation result with reasons
   */
  validateProfileCompatibility(
    profile: EmbeddingProfile,
    capabilities: HardwareCapabilities
  ): { compatible: boolean; reasons: string[] } {
    // First resolve auto values to get concrete device
    const resolved = this.resolveProfile(profile, capabilities);

    // Use capability evaluator for validation (resolved device is never 'auto')
    return this.capabilityEvaluator.validateProfile(resolved, capabilities);
  }

  /**
   * Optimize a profile for specific hardware by adjusting settings
   *
   * Optimizations:
   * - Adjust batch size based on available RAM
   * - Select optimal quantization for device
   * - Validate device compatibility and fall back if needed
   *
   * @param profile Profile to optimize
   * @param capabilities Hardware capabilities
   * @returns Optimized profile
   */
  optimizeProfile(
    profile: EmbeddingProfile,
    capabilities: HardwareCapabilities
  ): EmbeddingProfile {
    // Resolve profile first to ensure device is not 'auto'
    const optimized = this.resolveProfile(profile, capabilities);

    // Validate device compatibility (optimized.device is never 'auto' after resolveProfile)
    if (optimized.device !== 'auto') {
      const deviceCompat = this.capabilityEvaluator.validateDevice(capabilities, optimized.device);
      if (!deviceCompat.available) {
        // Fall back to best available device
        optimized.device = this.capabilityEvaluator.getBestDevice(capabilities);

        // Update quantization for new device
        optimized.quantization = this.resolveQuantization(optimized.device);
      }
    }

    return optimized;
  }

  /**
   * Compare two profiles to detect dimension changes
   *
   * Dimension changes require cache invalidation
   *
   * @param oldProfile Previous profile
   * @param newProfile New profile
   * @returns True if dimensions changed
   */
  hasDimensionChange(oldProfile: EmbeddingProfile, newProfile: EmbeddingProfile): boolean {
    return oldProfile.dimensions !== newProfile.dimensions;
  }

  /**
   * Compare two profiles to detect model changes
   *
   * Model changes may require cache invalidation or re-download
   *
   * @param oldProfile Previous profile
   * @param newProfile New profile
   * @returns True if model ID or version changed
   */
  hasModelChange(oldProfile: EmbeddingProfile, newProfile: EmbeddingProfile): boolean {
    return (
      oldProfile.model !== newProfile.model ||
      oldProfile.modelVersion !== newProfile.modelVersion
    );
  }
}
