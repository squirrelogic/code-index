/**
 * GPU Information Model
 *
 * Represents GPU hardware details when available.
 */

export type GPUVendor = 'NVIDIA' | 'AMD' | 'Apple' | 'Intel' | 'Unknown';

export interface GPUInfo {
  /** GPU vendor (NVIDIA, AMD, Apple, Intel, Unknown) */
  vendor: GPUVendor;

  /** GPU model name */
  name: string;

  /** GPU memory in bytes */
  memory: number;

  /** Driver version (NVIDIA/AMD) */
  driverVersion: string | null;

  /** NVIDIA compute capability (e.g., 8.6) */
  computeCapability: number | null;

  /** Metal version for Apple Silicon */
  metalVersion: string | null;
}

/**
 * Validates GPU info structure
 */
export function validateGPUInfo(gpu: Partial<GPUInfo>): gpu is GPUInfo {
  const validVendors: GPUVendor[] = ['NVIDIA', 'AMD', 'Apple', 'Intel', 'Unknown'];

  return (
    typeof gpu.vendor === 'string' &&
    validVendors.includes(gpu.vendor as GPUVendor) &&
    typeof gpu.name === 'string' &&
    gpu.name.length > 0 &&
    typeof gpu.memory === 'number' &&
    gpu.memory > 0 &&
    (gpu.driverVersion === null || typeof gpu.driverVersion === 'string') &&
    (gpu.computeCapability === null || typeof gpu.computeCapability === 'number') &&
    (gpu.metalVersion === null || typeof gpu.metalVersion === 'string')
  );
}
