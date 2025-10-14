/**
 * Quantization Utilities (T078)
 *
 * Helper functions for int8/int4/fp16/fp32 configuration and validation.
 * Provides utilities for:
 * - Quantization level validation
 * - Backend compatibility checks
 * - Device compatibility checks
 * - Recommended quantization selection
 */

import type { Backend, Device, Quantization } from '../../../models/EmbeddingProfile.js';

/**
 * Quantization compatibility matrix
 */
const QUANTIZATION_COMPATIBILITY = {
  onnx: {
    cpu: ['int8', 'int4', 'fp32'],
    mps: ['fp16', 'fp32'],
    cuda: ['fp16', 'fp32'],
    auto: ['int8', 'int4', 'fp16', 'fp32']
  },
  pytorch: {
    cpu: ['int8', 'fp32'],
    mps: ['fp16', 'fp32'],
    cuda: ['fp16', 'fp32'],
    auto: ['int8', 'fp16', 'fp32']
  }
} as const;

/**
 * Recommended quantization levels by device
 */
const RECOMMENDED_QUANTIZATION: Record<Device, Quantization> = {
  cpu: 'int8',     // Best performance on CPU
  mps: 'fp16',     // Apple Silicon supports fp16 well
  cuda: 'fp16',    // NVIDIA GPUs efficient with fp16
  auto: 'auto'     // Will be resolved at runtime
};

/**
 * Validate if a quantization level is compatible with backend and device
 *
 * @param quantization Quantization level to validate
 * @param backend Backend type (onnx or pytorch)
 * @param device Target device
 * @returns Validation result with compatibility flag and reason if incompatible
 */
export function validateQuantizationCompatibility(
  quantization: Quantization,
  backend: Backend,
  device: Device
): { compatible: boolean; reason?: string } {
  // Skip validation for 'auto' - will be resolved at runtime
  if (quantization === 'auto' || device === 'auto') {
    return { compatible: true };
  }

  // Check if backend is supported
  if (!(backend in QUANTIZATION_COMPATIBILITY)) {
    return {
      compatible: false,
      reason: `Unknown backend: ${backend}`
    };
  }

  // Get compatible quantizations for this backend + device
  const compatibleQuants = QUANTIZATION_COMPATIBILITY[backend][device];

  if (!compatibleQuants) {
    return {
      compatible: false,
      reason: `Unknown device: ${device} for backend: ${backend}`
    };
  }

  // Check if quantization is in the compatible list
  if (!(compatibleQuants as readonly string[]).includes(quantization)) {
    return {
      compatible: false,
      reason: `${quantization} quantization is not compatible with ${backend} backend on ${device} device. Compatible options: ${compatibleQuants.join(', ')}`
    };
  }

  return { compatible: true };
}

/**
 * Get recommended quantization for a device
 *
 * @param device Target device
 * @returns Recommended quantization level
 */
export function getRecommendedQuantization(device: Device): Quantization {
  return RECOMMENDED_QUANTIZATION[device] || 'fp32';
}

/**
 * Get all compatible quantization options for a backend and device
 *
 * @param backend Backend type
 * @param device Target device
 * @returns Array of compatible quantization levels
 */
export function getCompatibleQuantizations(
  backend: Backend,
  device: Device
): Quantization[] {
  if (device === 'auto') {
    // Return all possible quantizations for the backend
    return Array.from(new Set(
      Object.values(QUANTIZATION_COMPATIBILITY[backend] || {}).flat()
    )) as Quantization[];
  }

  const compatList = QUANTIZATION_COMPATIBILITY[backend]?.[device];
  return compatList ? [...compatList] as Quantization[] : [];
}

/**
 * Check if quantization requires special model files
 *
 * For ONNX: int8/int4 require quantized model files
 * For PyTorch: int8 requires quantization at runtime
 *
 * @param quantization Quantization level
 * @param backend Backend type
 * @returns True if special model files are required
 */
export function requiresQuantizedModel(quantization: Quantization, backend: Backend): boolean {
  if (backend === 'onnx') {
    return quantization === 'int8' || quantization === 'int4';
  }

  // PyTorch performs quantization at runtime
  return false;
}

/**
 * Get quantization precision in bits
 *
 * @param quantization Quantization level
 * @returns Bit precision or null for 'auto'
 */
export function getQuantizationBits(quantization: Quantization): number | null {
  switch (quantization) {
    case 'int4':
      return 4;
    case 'int8':
      return 8;
    case 'fp16':
      return 16;
    case 'fp32':
      return 32;
    case 'auto':
      return null;
  }
}

/**
 * Estimate memory reduction factor for quantization
 *
 * Compares quantization level to fp32 baseline
 *
 * @param quantization Quantization level
 * @returns Memory reduction factor (e.g., 4 means 4x smaller than fp32)
 */
export function getMemoryReductionFactor(quantization: Quantization): number {
  const bits = getQuantizationBits(quantization);

  if (bits === null) {
    return 1; // No reduction for 'auto' until resolved
  }

  // Compare to fp32 (32 bits)
  return 32 / bits;
}

/**
 * Estimate speedup factor for quantization on CPU
 *
 * Based on research benchmarks for int8 vs fp32
 *
 * @param quantization Quantization level
 * @param device Target device
 * @returns Expected speedup factor (e.g., 2 means 2x faster)
 */
export function getSpeedupFactor(quantization: Quantization, device: Device): number {
  if (device === 'cpu') {
    switch (quantization) {
      case 'int4':
        return 3.0; // Estimated
      case 'int8':
        return 2.1; // Based on research benchmarks
      case 'fp16':
        return 1.0; // CPU doesn't accelerate fp16
      case 'fp32':
        return 1.0;
      case 'auto':
        return 1.0;
    }
  }

  if (device === 'mps' || device === 'cuda') {
    switch (quantization) {
      case 'fp16':
        return 1.8; // GPU accelerates fp16
      case 'int8':
        return 1.2; // Some acceleration but not optimal for GPU
      case 'int4':
        return 1.1;
      case 'fp32':
        return 1.0;
      case 'auto':
        return 1.0;
    }
  }

  return 1.0;
}

/**
 * Format quantization for display
 *
 * @param quantization Quantization level
 * @returns Human-readable string
 */
export function formatQuantization(quantization: Quantization): string {
  switch (quantization) {
    case 'int4':
      return 'INT4 (4-bit integer)';
    case 'int8':
      return 'INT8 (8-bit integer)';
    case 'fp16':
      return 'FP16 (16-bit floating point)';
    case 'fp32':
      return 'FP32 (32-bit floating point)';
    case 'auto':
      return 'Auto (device-optimized)';
  }
}

/**
 * Get performance characteristics for quantization level
 *
 * @param quantization Quantization level
 * @param device Target device
 * @returns Performance profile with speed, memory, and quality info
 */
export function getQuantizationProfile(
  quantization: Quantization,
  device: Device
): {
  speed: 'very fast' | 'fast' | 'medium' | 'slow';
  memory: 'very low' | 'low' | 'medium' | 'high';
  quality: 'excellent' | 'very good' | 'good' | 'acceptable';
} {
  const speedup = getSpeedupFactor(quantization, device);
  const memoryReduction = getMemoryReductionFactor(quantization);

  // Determine speed rating
  let speed: 'very fast' | 'fast' | 'medium' | 'slow';
  if (speedup >= 2.5) speed = 'very fast';
  else if (speedup >= 1.8) speed = 'fast';
  else if (speedup >= 1.2) speed = 'medium';
  else speed = 'slow';

  // Determine memory rating
  let memory: 'very low' | 'low' | 'medium' | 'high';
  if (memoryReduction >= 4) memory = 'very low';
  else if (memoryReduction >= 2) memory = 'low';
  else if (memoryReduction >= 1.5) memory = 'medium';
  else memory = 'high';

  // Quality ratings (based on typical accuracy retention)
  const qualityMap: Record<Quantization, 'excellent' | 'very good' | 'good' | 'acceptable'> = {
    fp32: 'excellent',
    fp16: 'excellent',    // <0.1% accuracy loss
    int8: 'very good',    // <1% accuracy loss with calibration
    int4: 'good',         // ~2-3% accuracy loss
    auto: 'excellent'
  };

  return {
    speed,
    memory,
    quality: qualityMap[quantization]
  };
}
