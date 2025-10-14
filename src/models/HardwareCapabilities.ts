/**
 * Hardware Capabilities Model
 *
 * Represents the detected hardware configuration of the system.
 */

import { GPUInfo } from './GPUInfo.js';

// Re-export GPUInfo for convenience
export type { GPUInfo };

export type Platform = 'darwin' | 'linux' | 'win32';
export type Architecture = 'x64' | 'arm64';

export interface HardwareCapabilities {
  /** Number of available CPU cores */
  cpuCores: number;

  /** Total system RAM in bytes */
  totalRAM: number;

  /** Currently available RAM in bytes */
  freeRAM: number;

  /** Operating system */
  platform: Platform;

  /** CPU architecture */
  arch: Architecture;

  /** CPU model name */
  cpuModel: string;

  /** GPU information if available */
  gpu: GPUInfo | null;

  /** When hardware was detected */
  detectedAt: Date;

  /** Available ONNX Runtime execution providers */
  onnxProviders: string[];
}

/**
 * Validates hardware capabilities structure
 */
export function validateHardwareCapabilities(
  hw: Partial<HardwareCapabilities>
): hw is HardwareCapabilities {
  const validPlatforms: Platform[] = ['darwin', 'linux', 'win32'];
  const validArchs: Architecture[] = ['x64', 'arm64'];

  return (
    typeof hw.cpuCores === 'number' &&
    hw.cpuCores > 0 &&
    typeof hw.totalRAM === 'number' &&
    hw.totalRAM > 0 &&
    typeof hw.freeRAM === 'number' &&
    hw.freeRAM >= 0 &&
    typeof hw.platform === 'string' &&
    validPlatforms.includes(hw.platform as Platform) &&
    typeof hw.arch === 'string' &&
    validArchs.includes(hw.arch as Architecture) &&
    typeof hw.cpuModel === 'string' &&
    hw.cpuModel.length > 0 &&
    (hw.gpu === null || typeof hw.gpu === 'object') &&
    hw.detectedAt instanceof Date &&
    Array.isArray(hw.onnxProviders)
  );
}
