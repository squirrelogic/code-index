import type { HardwareCapabilities } from '../../models/HardwareCapabilities.js';
import type { EmbeddingProfile } from '../../models/EmbeddingProfile.js';

/**
 * Minimum hardware requirements for each profile
 */
const PROFILE_REQUIREMENTS = {
  light: {
    minRAM: 2 * 1024 * 1024 * 1024, // 2GB
    minCores: 1,
    requiredDevice: 'cpu' as const,
    minBatchSize: 8,
    maxBatchSize: 32
  },
  balanced: {
    minRAM: 4 * 1024 * 1024 * 1024, // 4GB
    minCores: 2,
    requiredDevice: 'auto' as const, // Can use CPU or GPU
    minBatchSize: 16,
    maxBatchSize: 128
  },
  performance: {
    minRAM: 8 * 1024 * 1024 * 1024, // 8GB
    minCores: 4,
    requiredDevice: 'gpu' as const, // Requires GPU (CUDA or MPS)
    minBatchSize: 32,
    maxBatchSize: 256
  }
};

/**
 * Batch size calculation constants
 */
const BATCH_SIZE_PER_GB_RAM = {
  cpu: 4, // 4 files per GB on CPU
  mps: 8, // 8 files per GB on Apple Silicon
  cuda: 16 // 16 files per GB on NVIDIA GPU
};

export interface ProfileCompatibility {
  profile: 'light' | 'balanced' | 'performance';
  compatible: boolean;
  reasons: string[];
  recommendedBatchSize: number;
}

export interface DeviceCompatibility {
  device: 'cpu' | 'mps' | 'cuda';
  available: boolean;
  reasons: string[];
}

/**
 * CapabilityEvaluator service - Evaluates hardware capabilities and profile compatibility
 *
 * This service analyzes detected hardware capabilities and:
 * - Determines which embedding profiles are supported
 * - Calculates recommended batch sizes based on available RAM
 * - Validates device compatibility (CPU, MPS, CUDA)
 * - Provides fallback recommendations
 */
export class CapabilityEvaluator {
  /**
   * Evaluate which profiles are compatible with the hardware
   *
   * @param capabilities Detected hardware capabilities
   * @returns Array of profile compatibility results
   */
  evaluateProfiles(capabilities: HardwareCapabilities): ProfileCompatibility[] {
    const results: ProfileCompatibility[] = [];

    // Evaluate each profile
    for (const [profileName, requirements] of Object.entries(PROFILE_REQUIREMENTS)) {
      const profile = profileName as 'light' | 'balanced' | 'performance';
      const reasons: string[] = [];
      let compatible = true;

      // Check RAM requirement
      if (capabilities.totalRAM < requirements.minRAM) {
        compatible = false;
        const requiredGB = requirements.minRAM / (1024 * 1024 * 1024);
        const availableGB = (capabilities.totalRAM / (1024 * 1024 * 1024)).toFixed(1);
        reasons.push(`Insufficient RAM: ${availableGB}GB available, ${requiredGB}GB required`);
      }

      // Check CPU cores requirement
      if (capabilities.cpuCores < requirements.minCores) {
        compatible = false;
        reasons.push(`Insufficient CPU cores: ${capabilities.cpuCores} available, ${requirements.minCores} required`);
      }

      // Check device requirement
      if (requirements.requiredDevice === 'gpu' && !capabilities.gpu) {
        compatible = false;
        reasons.push('GPU required but not detected');
      }

      // Calculate recommended batch size for this profile
      const recommendedBatchSize = this.calculateBatchSize(capabilities, profile);

      results.push({
        profile,
        compatible,
        reasons,
        recommendedBatchSize
      });
    }

    return results;
  }

  /**
   * Calculate recommended batch size based on available RAM and device
   *
   * Formula:
   * - CPU: 4 files per GB of available RAM
   * - MPS: 8 files per GB of available RAM
   * - CUDA: 16 files per GB of available RAM
   * - Clamped to profile min/max limits
   *
   * @param capabilities Detected hardware capabilities
   * @param profileName Target profile name
   * @returns Recommended batch size
   */
  calculateBatchSize(
    capabilities: HardwareCapabilities,
    profileName: 'light' | 'balanced' | 'performance'
  ): number {
    const requirements = PROFILE_REQUIREMENTS[profileName];
    const availableRAM = capabilities.freeRAM;
    const availableRAMGB = availableRAM / (1024 * 1024 * 1024);

    // Determine device type
    let device: 'cpu' | 'mps' | 'cuda' = 'cpu';
    if (capabilities.gpu) {
      if (capabilities.gpu.vendor === 'NVIDIA') {
        device = 'cuda';
      } else if (capabilities.gpu.vendor === 'Apple') {
        device = 'mps';
      }
    }

    // Calculate batch size based on available RAM
    const filesPerGB = BATCH_SIZE_PER_GB_RAM[device];
    let batchSize = Math.floor(availableRAMGB * filesPerGB);

    // Clamp to profile limits
    batchSize = Math.max(requirements.minBatchSize, batchSize);
    batchSize = Math.min(requirements.maxBatchSize, batchSize);

    // Always use power of 2 for better performance
    batchSize = this.roundToPowerOfTwo(batchSize);

    return batchSize;
  }

  /**
   * Validate if a specific device is compatible with the hardware
   *
   * @param capabilities Detected hardware capabilities
   * @param device Target device (cpu, mps, cuda)
   * @returns Device compatibility result
   */
  validateDevice(
    capabilities: HardwareCapabilities,
    device: 'cpu' | 'mps' | 'cuda'
  ): DeviceCompatibility {
    const reasons: string[] = [];
    let available = false;

    switch (device) {
      case 'cpu':
        // CPU is always available
        available = true;
        break;

      case 'mps':
        // MPS requires Apple Silicon
        if (capabilities.platform === 'darwin' && capabilities.arch === 'arm64') {
          if (capabilities.gpu?.vendor === 'Apple') {
            available = true;
          } else {
            reasons.push('Apple Silicon detected but GPU information unavailable');
          }
        } else {
          reasons.push('MPS requires macOS on Apple Silicon');
        }
        break;

      case 'cuda':
        // CUDA requires NVIDIA GPU
        if (capabilities.gpu?.vendor === 'NVIDIA') {
          // Check compute capability (minimum 6.0 for modern ONNX Runtime)
          const computeCap = capabilities.gpu.computeCapability || 0;
          if (computeCap >= 6.0) {
            available = true;
          } else {
            reasons.push(`CUDA compute capability ${computeCap} too old (minimum 6.0 required)`);
          }
        } else {
          reasons.push('CUDA requires NVIDIA GPU');
        }
        break;
    }

    return {
      device,
      available,
      reasons
    };
  }

  /**
   * Get the best available device for the hardware
   *
   * Priority order: CUDA > MPS > CPU
   *
   * @param capabilities Detected hardware capabilities
   * @returns Best available device
   */
  getBestDevice(capabilities: HardwareCapabilities): 'cpu' | 'mps' | 'cuda' {
    // Try CUDA first (fastest)
    const cudaCompat = this.validateDevice(capabilities, 'cuda');
    if (cudaCompat.available) {
      return 'cuda';
    }

    // Try MPS next (Apple Silicon)
    const mpsCompat = this.validateDevice(capabilities, 'mps');
    if (mpsCompat.available) {
      return 'mps';
    }

    // Fall back to CPU (always available)
    return 'cpu';
  }

  /**
   * Get the best compatible profile for the hardware
   *
   * Selection logic:
   * 1. If CUDA available with compute ≥7.5: performance profile
   * 2. If MPS or CUDA with compute ≥6.0: balanced profile
   * 3. Otherwise: light profile
   *
   * @param capabilities Detected hardware capabilities
   * @returns Recommended profile name
   */
  getBestProfile(capabilities: HardwareCapabilities): 'light' | 'balanced' | 'performance' {
    const profileCompatibility = this.evaluateProfiles(capabilities);

    // Check if performance profile is compatible
    const performanceCompat = profileCompatibility.find(p => p.profile === 'performance');
    if (performanceCompat?.compatible) {
      // Additional check: NVIDIA RTX 2000+ series (compute capability ≥7.5)
      if (capabilities.gpu?.vendor === 'NVIDIA') {
        const computeCap = capabilities.gpu.computeCapability || 0;
        if (computeCap >= 7.5) {
          return 'performance';
        }
      }
    }

    // Check if balanced profile is compatible
    const balancedCompat = profileCompatibility.find(p => p.profile === 'balanced');
    if (balancedCompat?.compatible) {
      // Use balanced if we have any GPU or sufficient RAM
      if (capabilities.gpu || capabilities.totalRAM >= 8 * 1024 * 1024 * 1024) {
        return 'balanced';
      }
    }

    // Fall back to light profile
    return 'light';
  }

  /**
   * Validate if a profile configuration is compatible with hardware
   *
   * @param profile Profile to validate
   * @param capabilities Detected hardware capabilities
   * @returns Validation result with reasons
   */
  validateProfile(
    profile: EmbeddingProfile,
    capabilities: HardwareCapabilities
  ): { compatible: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Validate device (skip if 'auto')
    if (profile.device !== 'auto') {
      const deviceCompat = this.validateDevice(capabilities, profile.device);
      if (!deviceCompat.available) {
        reasons.push(...deviceCompat.reasons);
      }
    }

    // Validate batch size is within safe limits
    const safeMaxBatch = this.calculateBatchSize(capabilities, profile.name as 'light' | 'balanced' | 'performance');
    if (profile.batchSize > safeMaxBatch * 2) {
      reasons.push(`Batch size ${profile.batchSize} may exceed available memory (recommended max: ${safeMaxBatch})`);
    }

    // Validate quantization compatibility
    if (profile.backend === 'onnx') {
      if (profile.quantization === 'int4' && profile.device === 'cuda') {
        reasons.push('int4 quantization not recommended for CUDA (use fp16 or int8)');
      }
    }

    return {
      compatible: reasons.length === 0,
      reasons
    };
  }

  /**
   * Round a number to the nearest power of 2
   *
   * @param n Input number
   * @returns Nearest power of 2
   */
  private roundToPowerOfTwo(n: number): number {
    return Math.pow(2, Math.round(Math.log2(n)));
  }
}
