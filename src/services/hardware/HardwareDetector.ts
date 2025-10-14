import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { HardwareCapabilities, GPUInfo, Platform, Architecture } from '../../models/HardwareCapabilities.js';

const execAsync = promisify(exec);

/**
 * HardwareDetector service - Detects CPU, GPU, and ONNX Runtime capabilities
 *
 * This service performs comprehensive hardware detection including:
 * - CPU cores, model, and architecture
 * - System RAM (total and available)
 * - GPU detection (NVIDIA CUDA, Apple Silicon MPS)
 * - ONNX Runtime execution providers
 *
 * Detection is designed to be fast (<2s) and gracefully handle missing hardware.
 */
export class HardwareDetector {
  private cachedCapabilities: HardwareCapabilities | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Detect all hardware capabilities with caching
   *
   * Features graceful degradation:
   * - If GPU detection fails: falls back to CPU-only
   * - If ONNX detection fails: falls back to ['CPUExecutionProvider']
   * - If CPU detection fails: uses safe defaults
   *
   * @returns Complete hardware capabilities (never throws)
   */
  async detect(): Promise<HardwareCapabilities> {
    const now = Date.now();

    // Return cached result if still valid
    if (this.cachedCapabilities && (now - this.cacheTimestamp) < this.CACHE_TTL_MS) {
      return this.cachedCapabilities;
    }

    try {
      // Detect all capabilities in parallel for speed
      const [cpuInfo, gpuInfo, onnxProviders] = await Promise.all([
        this.detectCPU().catch(error => this.getCPUFallback(error)),
        this.detectGPU().catch(error => {
          console.warn('GPU detection failed, falling back to CPU-only:', error.message);
          return null;
        }),
        this.detectONNXProviders().catch(error => {
          console.warn('ONNX provider detection failed, using CPU only:', error.message);
          return ['CPUExecutionProvider'];
        })
      ]);

      const capabilities: HardwareCapabilities = {
        cpuCores: cpuInfo.cores,
        totalRAM: cpuInfo.totalRAM,
        freeRAM: cpuInfo.freeRAM,
        platform: cpuInfo.platform as Platform,
        arch: cpuInfo.arch as Architecture,
        cpuModel: cpuInfo.model,
        gpu: gpuInfo,
        detectedAt: new Date(),
        onnxProviders
      };

      // Validate capabilities
      this.validateCapabilities(capabilities);

      // Cache the result
      this.cachedCapabilities = capabilities;
      this.cacheTimestamp = now;

      return capabilities;
    } catch (error) {
      console.error('Hardware detection failed completely, using safe defaults:', error);
      // Return minimal safe defaults
      return this.getSafeDefaults();
    }
  }

  /**
   * Validate detected capabilities
   *
   * @param capabilities Capabilities to validate
   * @throws Error if capabilities are invalid
   */
  private validateCapabilities(capabilities: HardwareCapabilities): void {
    if (capabilities.cpuCores <= 0) {
      throw new Error(`Invalid CPU cores: ${capabilities.cpuCores}`);
    }

    if (capabilities.totalRAM <= 0) {
      throw new Error(`Invalid total RAM: ${capabilities.totalRAM}`);
    }

    if (capabilities.freeRAM < 0 || capabilities.freeRAM > capabilities.totalRAM) {
      throw new Error(`Invalid free RAM: ${capabilities.freeRAM} (total: ${capabilities.totalRAM})`);
    }

    if (!['darwin', 'linux', 'win32'].includes(capabilities.platform)) {
      console.warn(`Unsupported platform: ${capabilities.platform}, proceeding anyway`);
    }

    if (capabilities.onnxProviders.length === 0) {
      throw new Error('No ONNX execution providers available');
    }
  }

  /**
   * Get safe default capabilities if detection fails completely
   *
   * @returns Minimal safe capabilities (CPU-only, 2 cores, 4GB RAM)
   */
  private getSafeDefaults(): HardwareCapabilities {
    return {
      cpuCores: 2,
      totalRAM: 4 * 1024 * 1024 * 1024, // 4GB
      freeRAM: 2 * 1024 * 1024 * 1024, // 2GB
      platform: 'linux',
      arch: 'x64',
      cpuModel: 'Unknown CPU',
      gpu: null,
      detectedAt: new Date(),
      onnxProviders: ['CPUExecutionProvider']
    };
  }

  /**
   * Get CPU fallback if detection fails
   *
   * @param error Original error
   * @returns Fallback CPU info
   */
  private getCPUFallback(error: Error): {
    cores: number;
    model: string;
    totalRAM: number;
    freeRAM: number;
    platform: string;
    arch: string;
  } {
    console.warn('CPU detection failed, using fallback:', error.message);

    // Try to get at least some info from os module
    try {
      return {
        cores: os.cpus().length || 2,
        model: 'Unknown CPU',
        totalRAM: os.totalmem() || 4 * 1024 * 1024 * 1024,
        freeRAM: os.freemem() || 2 * 1024 * 1024 * 1024,
        platform: os.platform(),
        arch: os.arch()
      };
    } catch {
      // Complete fallback
      return {
        cores: 2,
        model: 'Unknown CPU',
        totalRAM: 4 * 1024 * 1024 * 1024,
        freeRAM: 2 * 1024 * 1024 * 1024,
        platform: 'linux',
        arch: 'x64'
      };
    }
  }

  /**
   * Detect CPU information using Node.js os module
   *
   * @returns CPU cores, model, RAM, platform, and architecture
   */
  private async detectCPU(): Promise<{
    cores: number;
    model: string;
    totalRAM: number;
    freeRAM: number;
    platform: string;
    arch: string;
  }> {
    const cpus = os.cpus();
    const cores = cpus.length;
    const model = cpus[0]?.model || 'Unknown CPU';
    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const platform = os.platform();
    const arch = os.arch();

    return {
      cores,
      model,
      totalRAM,
      freeRAM,
      platform,
      arch
    };
  }

  /**
   * Detect GPU hardware (NVIDIA CUDA or Apple Silicon MPS)
   *
   * Tries platform-specific detection in order:
   * 1. NVIDIA GPU (nvidia-smi on all platforms)
   * 2. Apple Silicon (system_profiler on macOS)
   *
   * @returns GPU information or null if no GPU detected
   */
  private async detectGPU(): Promise<GPUInfo | null> {
    const platform = os.platform();

    // Try NVIDIA detection on all platforms
    const nvidiaGPU = await this.detectNVIDIA();
    if (nvidiaGPU) {
      return nvidiaGPU;
    }

    // Try Apple Silicon detection on macOS
    if (platform === 'darwin') {
      const appleGPU = await this.detectAppleSilicon();
      if (appleGPU) {
        return appleGPU;
      }
    }

    // No GPU detected
    return null;
  }

  /**
   * Detect NVIDIA GPU using nvidia-smi
   *
   * Parses nvidia-smi output to extract:
   * - GPU name
   * - GPU memory (in bytes)
   * - Driver version
   * - Compute capability
   *
   * @returns NVIDIA GPU info or null if not available
   */
  private async detectNVIDIA(): Promise<GPUInfo | null> {
    try {
      // Query nvidia-smi for GPU information
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader,nounits',
        { timeout: 2000 }
      );

      const lines = stdout.trim().split('\n');
      if (lines.length === 0 || !lines[0]) {
        return null;
      }

      // Parse first GPU (multi-GPU support can be added later)
      const [name, memoryMB, driverVersion, computeCap] = lines[0].split(',').map(s => s.trim());

      if (!name || !memoryMB) {
        return null;
      }

      const memory = parseInt(memoryMB, 10) * 1024 * 1024; // Convert MB to bytes
      const computeCapability = parseFloat(computeCap || '0');

      return {
        vendor: 'NVIDIA',
        name,
        memory,
        driverVersion: driverVersion || null,
        computeCapability,
        metalVersion: null
      };
    } catch (error) {
      // nvidia-smi not available or failed
      return null;
    }
  }

  /**
   * Detect Apple Silicon GPU using system_profiler
   *
   * Parses system_profiler output to extract:
   * - GPU name (chip name)
   * - Unified memory (shared with system)
   * - Metal version
   *
   * @returns Apple GPU info or null if not Apple Silicon
   */
  private async detectAppleSilicon(): Promise<GPUInfo | null> {
    try {
      // Check if this is Apple Silicon by looking at chip name
      const { stdout: chipInfo } = await execAsync(
        'sysctl -n machdep.cpu.brand_string',
        { timeout: 2000 }
      );

      const chipName = chipInfo.trim();
      const isAppleSilicon = chipName.includes('Apple');

      if (!isAppleSilicon) {
        return null;
      }

      // Get Metal version
      let metalVersion: string | null = null;
      try {
        const { stdout: metalInfo } = await execAsync(
          'system_profiler SPDisplaysDataType | grep "Metal Support"',
          { timeout: 2000 }
        );

        // Extract Metal version (e.g., "Metal: Metal 3 Family 8")
        const match = metalInfo.match(/Metal[:\s]+(\d+)/i);
        if (match) {
          metalVersion = `${match[1]}.0`;
        }
      } catch {
        // Metal version detection failed, use default
        metalVersion = '3.0'; // Assume Metal 3 for Apple Silicon
      }

      // Apple Silicon uses unified memory - use system total RAM
      const memory = os.totalmem();

      return {
        vendor: 'Apple',
        name: chipName,
        memory,
        driverVersion: null,
        computeCapability: null,
        metalVersion
      };
    } catch (error) {
      // Not Apple Silicon or detection failed
      return null;
    }
  }

  /**
   * Detect available ONNX Runtime execution providers
   *
   * This detection is done by attempting to import and query ONNX Runtime.
   * Providers are ordered by preference (GPU providers first).
   *
   * Common providers:
   * - CPUExecutionProvider (always available)
   * - CUDAExecutionProvider (NVIDIA GPU)
   * - CoreMLExecutionProvider (Apple Silicon)
   * - DirectMLExecutionProvider (Windows GPU)
   *
   * @returns Array of available ONNX execution providers
   */
  private async detectONNXProviders(): Promise<string[]> {
    try {
      // Dynamically import onnxruntime-node to check available providers
      // Note: This requires onnxruntime-node to be installed
      await import('onnxruntime-node');

      const providers: string[] = [];

      // Always add CPU as fallback
      providers.push('CPUExecutionProvider');

      // Check for platform-specific providers
      const platform = os.platform();
      const arch = os.arch();

      // CUDA provider (NVIDIA GPU)
      if (await this.detectNVIDIA()) {
        providers.unshift('CUDAExecutionProvider');
      }

      // CoreML provider (Apple Silicon)
      if (platform === 'darwin' && arch === 'arm64') {
        providers.unshift('CoreMLExecutionProvider');
      }

      // DirectML provider (Windows GPU)
      if (platform === 'win32') {
        providers.unshift('DirectMLExecutionProvider');
      }

      return providers;
    } catch (error) {
      // ONNX Runtime not installed or failed to load
      // Return CPU as fallback
      return ['CPUExecutionProvider'];
    }
  }

  /**
   * Clear the hardware detection cache
   * Useful for forcing re-detection after hardware changes
   */
  clearCache(): void {
    this.cachedCapabilities = null;
    this.cacheTimestamp = 0;
  }
}
