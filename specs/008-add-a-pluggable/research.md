# Research: Pluggable Adapter Patterns for ML Model Inference

**Feature**: Pluggable Embedding Layer (008-add-a-pluggable)
**Research Date**: 2025-10-14
**Focus**: TypeScript adapter patterns, dependency injection, error handling, configuration management, testing, and extensibility for ML model inference

---

## Executive Summary

This research explores best practices for designing pluggable adapter patterns in TypeScript for ML model inference systems. The findings provide actionable guidance on interface design, error handling strategies, configuration management, testing approaches, and extensibility patterns specifically tailored for the code-index embedding layer feature.

**Key Recommendations**:
1. Use **Strategy Pattern** with dependency injection for runtime model selection
2. Implement **Result/Either monad** for type-safe error handling
3. Apply **exponential backoff with circuit breaker** for resilience
4. Use **adapter registry pattern** for dynamic model discovery
5. Implement **contract testing** with mock adapters for validation

---

## 1. Interface Design

### Research Question
How to design a clean adapter interface that supports both local (ONNX Runtime) and hosted (API-based) models?

### Key Findings

#### 1.1 Strategy Pattern for Model Selection

The **Strategy Pattern** is the ideal choice for ML model adapters because it:
- Defines a family of algorithms (embedding models) and makes them interchangeable
- Allows runtime selection of embedding strategies
- Encapsulates model-specific logic behind a common interface

**Source**: Refactoring Guru - Strategy Pattern in TypeScript

#### 1.2 LangChain's Adapter Architecture

LangChain.js provides a proven model for adapter patterns in ML inference:
- Core abstractions in `@langchain/core` with base interfaces
- Integration packages (`@langchain/openai`, `@langchain/anthropic`) extend base abstractions
- Lightweight adapters with minimal dependencies
- Clear separation between protocol adapters and model implementations

**Example**: LangChain MCP adapters wrap Model Context Protocol tools to make them compatible with LangChain's native tool interfaces.

**Source**: LangChain.js Architecture Documentation

#### 1.3 OpenAI/Anthropic SDK Comparison

Real-world example of adapter interface challenges:
- Anthropic provides OpenAI SDK compatibility layer for testing
- Different providers handle system messages differently (Anthropic concatenates all system messages)
- Feature parity issues (audio input, prompt caching) require adapter-level handling
- Compatibility layers are useful for testing but not recommended for production

**Lesson**: Don't try to perfectly unify incompatible APIs—accept that adapters may have different capabilities.

**Source**: Anthropic Claude API Documentation - OpenAI SDK Compatibility

### Decision: Base Adapter Interface

**Chosen Approach**: Create a minimal, well-typed adapter interface with clear contracts.

```typescript
/**
 * Core adapter interface for embedding generation
 * Supports both local (ONNX) and hosted (API) models
 */
interface IEmbeddingAdapter {
  /** Unique identifier for this adapter (e.g., "onnx:all-MiniLM-L6-v2") */
  readonly id: string;

  /** Display name for CLI/UI (e.g., "Local: all-MiniLM-L6-v2") */
  readonly name: string;

  /** Expected vector dimensions for validation */
  readonly dimensions: number;

  /** Model version for metadata tracking */
  readonly version: string;

  /** Adapter capabilities flags */
  readonly capabilities: AdapterCapabilities;

  /**
   * Initialize adapter resources (load model, validate credentials)
   * Called once during adapter registration
   * @throws AdapterInitializationError if setup fails
   */
  initialize(): Promise<Result<void, AdapterError>>;

  /**
   * Generate embeddings for a batch of text inputs
   * @param texts Array of text chunks to embed
   * @param options Optional parameters (batch size, timeout)
   * @returns Result with embedding vectors or error
   */
  embed(
    texts: string[],
    options?: EmbedOptions
  ): Promise<Result<EmbeddingBatch, AdapterError>>;

  /**
   * Cleanup adapter resources (unload model, close connections)
   * Called during shutdown or adapter hot-swap
   */
  dispose(): Promise<void>;

  /**
   * Health check for adapter availability
   * @returns Result indicating if adapter is ready
   */
  healthCheck(): Promise<Result<HealthStatus, AdapterError>>;
}

interface AdapterCapabilities {
  /** Supports batch processing */
  batching: boolean;

  /** Requires network connectivity */
  requiresNetwork: boolean;

  /** Supports concurrent requests */
  concurrent: boolean;

  /** Maximum batch size (null = no limit) */
  maxBatchSize: number | null;
}

interface EmbedOptions {
  /** Batch size for processing (adapter may override) */
  batchSize?: number;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Enable progress reporting */
  progressCallback?: (progress: EmbedProgress) => void;
}

interface EmbeddingBatch {
  /** Generated embedding vectors */
  vectors: number[][];

  /** Metadata for each embedding */
  metadata: EmbeddingMetadata[];

  /** Processing statistics */
  stats: BatchStats;
}

interface HealthStatus {
  available: boolean;
  latencyMs?: number;
  message?: string;
}
```

**Rationale**:
- **Minimal interface**: Only essential methods (initialize, embed, dispose, healthCheck)
- **Type-safe**: All return types wrapped in Result monad (see section 2)
- **Async by default**: All operations return Promises for consistency
- **Capability flags**: Explicitly declare adapter capabilities for intelligent orchestration
- **Metadata-rich**: Track versions, dimensions, and processing stats for debugging

**Alternatives Considered**:

1. **Synchronous interface with callbacks** ❌
   - Rejected: Makes error handling complex, incompatible with hosted APIs

2. **Single unified adapter for all models** ❌
   - Rejected: Violates Single Responsibility Principle, hard to test

3. **Event-based interface** ❌
   - Rejected: Overcomplicated for batch processing use case

---

## 2. Error Handling

### Research Question
What patterns should be used for handling adapter failures, retries, and fallbacks?

### Key Findings

#### 2.1 Result/Either Pattern for Type-Safe Errors

The **Result Pattern** transforms error handling from implicit try-catch to explicit type-safe returns:
- Makes failures part of method signatures
- Forces callers to handle errors explicitly
- Enables functional composition with railway-oriented programming
- Superior to throwing exceptions for expected failure modes

**Convention**: "Right is right" (success on Right, failure on Left)

**Source**: Multiple sources including Functional Error Handling in TypeScript articles

**Popular TypeScript Libraries**:
1. **true-myth**: Provides `Result`, `Maybe`, and `Task` types
2. **Purify**: Functional programming library with `Either` and `Maybe`
3. **Neverthrow**: Lightweight Result type library
4. **TsMonad**: Classic monad implementations

#### 2.2 Exponential Backoff Pattern

**Exponential backoff** increases wait times between retry attempts:
- Prevents thundering herd problem
- More resilient than fixed-delay retries
- Should be capped (typically 30-60 seconds max)

**TypeScript Implementation**:
- NPM package: `exponential-backoff` (simple generic retry solution)
- Custom implementation with configurable parameters

**Source**: AWS Prescriptive Guidance - Retry with Backoff Pattern

#### 2.3 Circuit Breaker Pattern

**Circuit breaker** complements retries by temporarily suspending requests when a service appears down:
- Three states: Closed (normal), Open (failing), Half-Open (testing recovery)
- Prevents cascading failures
- Can provide fallback values during open state

**Combining Patterns**: Circuit breaker + exponential backoff + fallback creates sophisticated resilience

**Source**: Tutorial on Circuit Breaker Pattern in TypeScript

#### 2.4 Attempt Pattern

The **Attempt Pattern** encapsulates try-catch into reusable utilities:
- `withFallback` utility extracts successful data or substitutes fallback
- Improves readability and maintainability
- Works well with Result types

**Source**: Simplify TypeScript Error Handling with the Attempt Pattern

### Decision: Resilient Error Handling Strategy

**Chosen Approach**: Combine Result monad + exponential backoff + circuit breaker

```typescript
import { Result, Ok, Err } from 'neverthrow';

/**
 * Typed error hierarchy for adapter failures
 */
abstract class AdapterError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;
  readonly timestamp: Date = new Date();

  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = this.constructor.name;
  }
}

class AdapterInitializationError extends AdapterError {
  readonly code = 'ADAPTER_INIT_FAILED';
  readonly retryable = false;
}

class AdapterNetworkError extends AdapterError {
  readonly code = 'ADAPTER_NETWORK_ERROR';
  readonly retryable = true;
}

class AdapterTimeoutError extends AdapterError {
  readonly code = 'ADAPTER_TIMEOUT';
  readonly retryable = true;
}

class AdapterValidationError extends AdapterError {
  readonly code = 'ADAPTER_VALIDATION_ERROR';
  readonly retryable = false;
}

class AdapterRateLimitError extends AdapterError {
  readonly code = 'ADAPTER_RATE_LIMIT';
  readonly retryable = true;

  constructor(message: string, public retryAfterMs?: number) {
    super(message);
  }
}

/**
 * Retry configuration with exponential backoff
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[]; // Error codes that trigger retry
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ADAPTER_NETWORK_ERROR', 'ADAPTER_TIMEOUT', 'ADAPTER_RATE_LIMIT']
};

/**
 * Execute function with exponential backoff retry
 */
async function withRetry<T>(
  fn: () => Promise<Result<T, AdapterError>>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<Result<T, AdapterError>> {
  let lastError: AdapterError | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const result = await fn();

    if (result.isOk()) {
      return result;
    }

    const error = result.error;
    lastError = error;

    // Don't retry non-retryable errors
    if (!error.retryable || !config.retryableErrors.includes(error.code)) {
      return result;
    }

    // Don't retry on last attempt
    if (attempt === config.maxRetries) {
      break;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
      config.maxDelayMs
    );

    // Special handling for rate limit errors
    const actualDelay = error instanceof AdapterRateLimitError && error.retryAfterMs
      ? error.retryAfterMs
      : delay;

    await sleep(actualDelay);
  }

  return Err(lastError!);
}

/**
 * Circuit breaker for adapter health management
 */
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(
    fn: () => Promise<Result<T, AdapterError>>
  ): Promise<Result<T, AdapterError>> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        return Err(new AdapterError(
          `Circuit breaker is open. Last failure: ${this.lastFailureTime?.toISOString()}`
        ));
      }
    }

    const result = await fn();

    if (result.isOk()) {
      this.onSuccess();
    } else {
      this.onFailure();
    }

    return result;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;

    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.config.resetTimeoutMs;
  }
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Open circuit after N failures
  resetTimeoutMs: number; // Try half-open after timeout
  halfOpenSuccessThreshold: number; // Close after N successes in half-open
}

/**
 * Adapter wrapper combining retry + circuit breaker
 */
class ResilientAdapter implements IEmbeddingAdapter {
  private circuitBreaker: CircuitBreaker;

  constructor(
    private baseAdapter: IEmbeddingAdapter,
    private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
    circuitBreakerConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      halfOpenSuccessThreshold: 2
    }
  ) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
  }

  get id() { return this.baseAdapter.id; }
  get name() { return this.baseAdapter.name; }
  get dimensions() { return this.baseAdapter.dimensions; }
  get version() { return this.baseAdapter.version; }
  get capabilities() { return this.baseAdapter.capabilities; }

  async initialize(): Promise<Result<void, AdapterError>> {
    // No retry for initialization - fail fast
    return this.baseAdapter.initialize();
  }

  async embed(
    texts: string[],
    options?: EmbedOptions
  ): Promise<Result<EmbeddingBatch, AdapterError>> {
    return this.circuitBreaker.execute(() =>
      withRetry(() => this.baseAdapter.embed(texts, options), this.retryConfig)
    );
  }

  async dispose(): Promise<void> {
    return this.baseAdapter.dispose();
  }

  async healthCheck(): Promise<Result<HealthStatus, AdapterError>> {
    return this.baseAdapter.healthCheck();
  }
}
```

**Rationale**:
- **Result monad**: Type-safe error handling, no uncaught exceptions
- **Error hierarchy**: Distinguishes retryable vs non-retryable errors
- **Exponential backoff**: Graceful handling of transient failures
- **Circuit breaker**: Protects against sustained failures
- **Composition**: ResilientAdapter wraps any base adapter transparently

**Alternatives Considered**:

1. **Try-catch with thrown exceptions** ❌
   - Rejected: No type safety, hard to track which errors can occur

2. **Callbacks for error handling** ❌
   - Rejected: Callback hell, difficult to compose

3. **Simple retry without circuit breaker** ⚠️
   - Considered: Simpler but doesn't protect against cascading failures

**Implementation Notes**:
- Use `neverthrow` library for Result type (lightweight, well-maintained)
- Circuit breaker state could be persisted for cross-process resilience
- Consider adding jitter to backoff delays to avoid thundering herd

---

## 3. Configuration Management

### Research Question
How to manage adapter-specific configuration and credentials securely?

### Key Findings

#### 3.1 Environment Variable Best Practices

**Standard Pattern**:
- Store secrets in environment variables (never in version control)
- Use `.env` files for local development
- Support standard `process.env` access
- Exclude `.env` from version control via `.gitignore`

**TypeScript Tools**:
- `dotenv` package: Standard library for loading `.env` files
- `@google-cloud/secret-manager`, `@aws-sdk/client-secrets-manager`: Cloud provider integration

**Source**: Multiple sources on TypeScript secrets management

#### 3.2 Configuration Layer Pattern

Centralized configuration management that:
- Validates required credentials at startup
- Provides type-safe access to configuration
- Supports multiple configuration sources (env vars, files, cloud secrets)
- Fails fast with clear error messages

**Source**: GCP Secret Manager + TypeScript articles

#### 3.3 Adapter-Specific Configuration

Each adapter has different configuration needs:
- **Local adapters**: Model file paths, worker threads, memory limits
- **Hosted adapters**: API keys, endpoints, rate limits, retry policies

**Challenge**: Balance between adapter-specific config and common interface

### Decision: Typed Configuration with Environment Variables

**Chosen Approach**: Layered configuration system with validation

```typescript
import { config as loadEnv } from 'dotenv';
import { Result, Ok, Err } from 'neverthrow';

/**
 * Base configuration for all adapters
 */
interface AdapterConfig {
  /** Adapter type identifier */
  type: 'onnx' | 'openai' | 'anthropic' | 'custom';

  /** Optional custom name override */
  name?: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Retry configuration */
  retry?: Partial<RetryConfig>;

  /** Circuit breaker configuration */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
}

/**
 * Configuration for ONNX local adapters
 */
interface OnnxAdapterConfig extends AdapterConfig {
  type: 'onnx';

  /** Path to ONNX model file (relative to project root) */
  modelPath: string;

  /** Number of worker threads (default: CPU cores - 1) */
  threads?: number;

  /** Maximum memory usage in MB */
  maxMemoryMb?: number;

  /** Enable GPU acceleration if available */
  useGpu?: boolean;
}

/**
 * Configuration for hosted API adapters
 */
interface HostedAdapterConfig extends AdapterConfig {
  type: 'openai' | 'anthropic' | 'custom';

  /** API endpoint URL */
  endpoint: string;

  /** API key (loaded from environment) */
  apiKey: string;

  /** Organization ID (optional) */
  organizationId?: string;

  /** Rate limit: requests per minute */
  rateLimit?: number;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** HTTP headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Configuration manager with validation
 */
class ConfigurationManager {
  private envLoaded = false;

  constructor(private envPath?: string) {}

  /**
   * Load environment variables from .env file
   */
  loadEnv(): Result<void, ConfigError> {
    try {
      loadEnv({ path: this.envPath });
      this.envLoaded = true;
      return Ok(undefined);
    } catch (error) {
      return Err(new ConfigError(
        `Failed to load .env file: ${error instanceof Error ? error.message : 'Unknown error'}`
      ));
    }
  }

  /**
   * Get configuration for a specific adapter
   */
  getAdapterConfig(adapterId: string): Result<AdapterConfig, ConfigError> {
    const type = this.getEnvVar(`EMBED_${adapterId}_TYPE`);

    switch (type) {
      case 'onnx':
        return this.getOnnxConfig(adapterId);
      case 'openai':
      case 'anthropic':
      case 'custom':
        return this.getHostedConfig(adapterId, type);
      default:
        return Err(new ConfigError(
          `Unknown adapter type "${type}" for adapter "${adapterId}". ` +
          `Valid types: onnx, openai, anthropic, custom`
        ));
    }
  }

  private getOnnxConfig(adapterId: string): Result<OnnxAdapterConfig, ConfigError> {
    const modelPath = this.getEnvVar(`EMBED_${adapterId}_MODEL_PATH`);
    if (!modelPath) {
      return Err(new ConfigError(
        `Missing required config: EMBED_${adapterId}_MODEL_PATH`
      ));
    }

    return Ok({
      type: 'onnx',
      modelPath,
      threads: this.getEnvNumber(`EMBED_${adapterId}_THREADS`),
      maxMemoryMb: this.getEnvNumber(`EMBED_${adapterId}_MAX_MEMORY_MB`),
      useGpu: this.getEnvBoolean(`EMBED_${adapterId}_USE_GPU`),
      debug: this.getEnvBoolean(`EMBED_${adapterId}_DEBUG`)
    });
  }

  private getHostedConfig(
    adapterId: string,
    type: 'openai' | 'anthropic' | 'custom'
  ): Result<HostedAdapterConfig, ConfigError> {
    const apiKey = this.getEnvVar(`EMBED_${adapterId}_API_KEY`);
    if (!apiKey) {
      return Err(new ConfigError(
        `Missing required config: EMBED_${adapterId}_API_KEY. ` +
        `Set this environment variable or add it to your .env file.`
      ));
    }

    const endpoint = this.getEnvVar(`EMBED_${adapterId}_ENDPOINT`);
    if (!endpoint) {
      return Err(new ConfigError(
        `Missing required config: EMBED_${adapterId}_ENDPOINT`
      ));
    }

    return Ok({
      type,
      endpoint,
      apiKey,
      organizationId: this.getEnvVar(`EMBED_${adapterId}_ORG_ID`),
      rateLimit: this.getEnvNumber(`EMBED_${adapterId}_RATE_LIMIT`),
      timeoutMs: this.getEnvNumber(`EMBED_${adapterId}_TIMEOUT_MS`),
      debug: this.getEnvBoolean(`EMBED_${adapterId}_DEBUG`)
    });
  }

  private getEnvVar(key: string): string | undefined {
    return process.env[key];
  }

  private getEnvNumber(key: string): number | undefined {
    const value = process.env[key];
    if (!value) return undefined;
    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }

  private getEnvBoolean(key: string): boolean | undefined {
    const value = process.env[key];
    if (!value) return undefined;
    return value.toLowerCase() === 'true' || value === '1';
  }
}

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Example .env file structure:
 *
 * # Default local model (ONNX)
 * EMBED_DEFAULT_TYPE=onnx
 * EMBED_DEFAULT_MODEL_PATH=.codeindex/models/all-MiniLM-L6-v2.onnx
 * EMBED_DEFAULT_THREADS=4
 * EMBED_DEFAULT_DEBUG=false
 *
 * # OpenAI hosted model (optional)
 * EMBED_OPENAI_TYPE=openai
 * EMBED_OPENAI_ENDPOINT=https://api.openai.com/v1/embeddings
 * EMBED_OPENAI_API_KEY=sk-...
 * EMBED_OPENAI_ORG_ID=org-...
 * EMBED_OPENAI_RATE_LIMIT=60
 * EMBED_OPENAI_TIMEOUT_MS=30000
 *
 * # Anthropic hosted model (optional)
 * EMBED_ANTHROPIC_TYPE=anthropic
 * EMBED_ANTHROPIC_ENDPOINT=https://api.anthropic.com/v1/embeddings
 * EMBED_ANTHROPIC_API_KEY=sk-ant-...
 */
```

**Rationale**:
- **Type-safe**: Explicit config interfaces with validation
- **Secure**: No hardcoded credentials, .env file excluded from git
- **Flexible**: Supports multiple adapters with different config needs
- **Developer-friendly**: Clear error messages, sensible defaults
- **Prefixed naming**: `EMBED_<ADAPTER>_<SETTING>` prevents collisions

**Alternatives Considered**:

1. **JSON configuration files** ⚠️
   - Considered: More structured but risks committing secrets to version control

2. **Cloud-only secrets management** ❌
   - Rejected: Violates offline-first principle

3. **Single unified config for all adapters** ❌
   - Rejected: Too inflexible, forces all adapters to support same options

**Security Considerations**:
- Document that `.env` must be in `.gitignore`
- Validate API keys at initialization (fail fast)
- Never log or display full API keys (show only last 4 chars)
- Support credential rotation without code changes

---

## 4. Testing

### Research Question
How to mock adapters for testing and create adapter contracts?

### Key Findings

#### 4.1 TypeScript Mocking Tools

**Popular Libraries**:
1. **ts-mockito**: Inspired by Java Mockito, type-safe mock objects
2. **typemoq**: Inspired by C# Moq, strong typing
3. **Jest with ts-jest**: Built-in mocking with TypeScript support
4. **Mock Service Worker (MSW)**: Intercepts network requests at browser/Node.js level

**Best Practice**: Keep all mock objects typed—avoid `any` types to catch breaking changes during refactoring.

**Source**: Mocking Objects in TypeScript Tests articles

#### 4.2 Contract Testing

**Contract testing** promotes consistency by:
- Defining a common set of types and patterns
- Verifying that implementations satisfy interface contracts
- Catching integration issues early

**Tools**:
- **Pact**: Consumer-driven contract testing framework
- **io-ts + fast-check**: Runtime type validation + property testing
- **JSON Schema**: Define contracts for API responses

**Approach**: Run contract tests before each deployment to ensure compatibility.

**Source**: Contract Testing with TypeScript articles

#### 4.3 Adapter Testing Strategy

**Three-Layer Testing**:
1. **Unit tests**: Test individual adapter methods in isolation
2. **Integration tests**: Test adapters against real or simulated services
3. **Contract tests**: Verify all adapters satisfy the `IEmbeddingAdapter` interface

**Mock Adapters**: Create test doubles for rapid testing without real models

**Source**: Multiple testing pattern resources

### Decision: Contract-Based Testing with Mock Adapters

**Chosen Approach**: Comprehensive testing strategy with contract validation

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Result, Ok, Err } from 'neverthrow';

/**
 * Abstract contract test suite for adapter interface
 * All adapter implementations must pass these tests
 */
export abstract class AdapterContractTests {
  protected abstract createAdapter(): IEmbeddingAdapter;
  protected abstract cleanup(): Promise<void>;

  /**
   * Run complete contract test suite
   */
  runContractTests(): void {
    describe('IEmbeddingAdapter Contract', () => {
      let adapter: IEmbeddingAdapter;

      beforeEach(async () => {
        adapter = this.createAdapter();
      });

      afterEach(async () => {
        await adapter.dispose();
        await this.cleanup();
      });

      describe('Metadata Properties', () => {
        it('should have unique id', () => {
          expect(adapter.id).toBeTruthy();
          expect(typeof adapter.id).toBe('string');
        });

        it('should have human-readable name', () => {
          expect(adapter.name).toBeTruthy();
          expect(typeof adapter.name).toBe('string');
        });

        it('should declare positive dimensions', () => {
          expect(adapter.dimensions).toBeGreaterThan(0);
          expect(Number.isInteger(adapter.dimensions)).toBe(true);
        });

        it('should have version string', () => {
          expect(adapter.version).toBeTruthy();
          expect(typeof adapter.version).toBe('string');
        });

        it('should declare capabilities', () => {
          expect(adapter.capabilities).toBeDefined();
          expect(typeof adapter.capabilities.batching).toBe('boolean');
          expect(typeof adapter.capabilities.requiresNetwork).toBe('boolean');
          expect(typeof adapter.capabilities.concurrent).toBe('boolean');
        });
      });

      describe('Lifecycle', () => {
        it('should initialize successfully', async () => {
          const result = await adapter.initialize();
          expect(result.isOk()).toBe(true);
        });

        it('should handle double initialization gracefully', async () => {
          await adapter.initialize();
          const result = await adapter.initialize();
          expect(result.isOk()).toBe(true); // Idempotent
        });

        it('should dispose without errors', async () => {
          await adapter.initialize();
          await expect(adapter.dispose()).resolves.not.toThrow();
        });
      });

      describe('Embedding Generation', () => {
        beforeEach(async () => {
          await adapter.initialize();
        });

        it('should generate embeddings for single text', async () => {
          const result = await adapter.embed(['Hello, world!']);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            const batch = result.value;
            expect(batch.vectors).toHaveLength(1);
            expect(batch.vectors[0]).toHaveLength(adapter.dimensions);
            expect(batch.metadata).toHaveLength(1);
          }
        });

        it('should generate embeddings for multiple texts', async () => {
          const texts = ['First text', 'Second text', 'Third text'];
          const result = await adapter.embed(texts);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            const batch = result.value;
            expect(batch.vectors).toHaveLength(texts.length);
            batch.vectors.forEach(vector => {
              expect(vector).toHaveLength(adapter.dimensions);
            });
          }
        });

        it('should return consistent embeddings for same input', async () => {
          const text = 'Deterministic test';
          const result1 = await adapter.embed([text]);
          const result2 = await adapter.embed([text]);

          expect(result1.isOk() && result2.isOk()).toBe(true);
          if (result1.isOk() && result2.isOk()) {
            expect(result1.value.vectors[0]).toEqual(result2.value.vectors[0]);
          }
        });

        it('should handle empty input gracefully', async () => {
          const result = await adapter.embed([]);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(result.value.vectors).toHaveLength(0);
          }
        });

        it('should validate vector dimensions', async () => {
          const result = await adapter.embed(['Test']);

          if (result.isOk()) {
            const dimensions = result.value.vectors[0].length;
            expect(dimensions).toBe(adapter.dimensions);
          }
        });
      });

      describe('Health Check', () => {
        it('should report unhealthy before initialization', async () => {
          const result = await adapter.healthCheck();

          if (result.isOk()) {
            expect(result.value.available).toBe(false);
          }
        });

        it('should report healthy after initialization', async () => {
          await adapter.initialize();
          const result = await adapter.healthCheck();

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(result.value.available).toBe(true);
          }
        });
      });

      describe('Error Handling', () => {
        it('should return error result for invalid operation', async () => {
          // Try to embed before initialization
          const result = await adapter.embed(['Test']);

          // Should either return error or initialize automatically
          if (result.isErr()) {
            expect(result.error).toBeInstanceOf(AdapterError);
          }
        });
      });
    });
  }
}

/**
 * Mock adapter for fast unit testing
 */
class MockEmbeddingAdapter implements IEmbeddingAdapter {
  readonly id = 'mock:test-adapter';
  readonly name = 'Mock Test Adapter';
  readonly dimensions = 384;
  readonly version = '1.0.0';
  readonly capabilities = {
    batching: true,
    requiresNetwork: false,
    concurrent: true,
    maxBatchSize: 100
  };

  private initialized = false;

  // Test hooks for behavior control
  public shouldFailInitialization = false;
  public shouldFailEmbedding = false;
  public embedLatencyMs = 0;

  async initialize(): Promise<Result<void, AdapterError>> {
    if (this.shouldFailInitialization) {
      return Err(new AdapterInitializationError('Mock initialization failure'));
    }
    this.initialized = true;
    return Ok(undefined);
  }

  async embed(
    texts: string[],
    options?: EmbedOptions
  ): Promise<Result<EmbeddingBatch, AdapterError>> {
    if (!this.initialized) {
      return Err(new AdapterError('Adapter not initialized'));
    }

    if (this.shouldFailEmbedding) {
      return Err(new AdapterNetworkError('Mock embedding failure'));
    }

    // Simulate latency
    if (this.embedLatencyMs > 0) {
      await sleep(this.embedLatencyMs);
    }

    // Generate fake embeddings (deterministic based on input)
    const vectors = texts.map(text => this.generateFakeEmbedding(text));
    const metadata = texts.map((text, index) => ({
      inputText: text,
      index,
      tokenCount: text.split(/\s+/).length
    }));

    return Ok({
      vectors,
      metadata,
      stats: {
        totalTexts: texts.length,
        durationMs: this.embedLatencyMs,
        tokensProcessed: metadata.reduce((sum, m) => sum + m.tokenCount, 0)
      }
    });
  }

  async dispose(): Promise<void> {
    this.initialized = false;
  }

  async healthCheck(): Promise<Result<HealthStatus, AdapterError>> {
    return Ok({
      available: this.initialized,
      latencyMs: this.embedLatencyMs
    });
  }

  private generateFakeEmbedding(text: string): number[] {
    // Simple deterministic fake embedding based on text hash
    const hash = this.simpleHash(text);
    return Array.from({ length: this.dimensions }, (_, i) =>
      Math.sin(hash + i) * 0.5 + 0.5
    );
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

/**
 * Property-based testing for adapter contracts
 */
describe('Property-Based Adapter Tests', () => {
  it('should always return vectors matching declared dimensions', async () => {
    const adapter = new MockEmbeddingAdapter();
    await adapter.initialize();

    // Generate random test inputs
    const randomTexts = Array.from(
      { length: Math.floor(Math.random() * 20) + 1 },
      () => Math.random().toString(36).substring(2)
    );

    const result = await adapter.embed(randomTexts);

    if (result.isOk()) {
      result.value.vectors.forEach(vector => {
        expect(vector.length).toBe(adapter.dimensions);
      });
    }
  });

  it('should always maintain input-output length consistency', async () => {
    const adapter = new MockEmbeddingAdapter();
    await adapter.initialize();

    for (let i = 0; i < 10; i++) {
      const inputCount = Math.floor(Math.random() * 50) + 1;
      const texts = Array.from({ length: inputCount }, (_, j) => `text-${j}`);

      const result = await adapter.embed(texts);

      if (result.isOk()) {
        expect(result.value.vectors.length).toBe(inputCount);
        expect(result.value.metadata.length).toBe(inputCount);
      }
    }
  });
});

/**
 * Example usage: Testing a concrete adapter implementation
 */
class OnnxAdapterContractTests extends AdapterContractTests {
  private adapter?: OnnxEmbeddingAdapter;

  protected createAdapter(): IEmbeddingAdapter {
    this.adapter = new OnnxEmbeddingAdapter({
      type: 'onnx',
      modelPath: '.codeindex/models/test-model.onnx'
    });
    return this.adapter;
  }

  protected async cleanup(): Promise<void> {
    // Clean up any test artifacts
  }
}

// Run contract tests for ONNX adapter
new OnnxAdapterContractTests().runContractTests();
```

**Rationale**:
- **Contract tests**: Ensure all adapters satisfy the interface
- **Mock adapter**: Fast, deterministic testing without real models
- **Property-based tests**: Verify invariants across random inputs
- **Test hooks**: Mock adapter allows simulating failures
- **Reusable**: Abstract test suite works for any adapter implementation

**Alternatives Considered**:

1. **Manual mocks for each test** ❌
   - Rejected: Too much duplication, inconsistent behavior

2. **Only integration tests with real models** ❌
   - Rejected: Too slow, requires model downloads, flaky

3. **Snapshot testing for embeddings** ⚠️
   - Considered: Useful for regression testing but brittle with model updates

**Testing Recommendations**:
- Run contract tests in CI for every adapter
- Use mock adapter for unit tests of orchestration logic
- Create "fixture" test models for integration tests (small, fast)
- Test error paths explicitly (network failures, timeouts, invalid inputs)

---

## 5. Extensibility

### Research Question
What are best practices for allowing users to add custom adapters?

### Key Findings

#### 5.1 Plugin Architecture Patterns

**Core Concepts**:
- **Core System**: Manages essential functionalities, orchestrates plugins, agnostic to plugin behavior
- **Plugins**: Implement use-case-specific functionality
- **Contract**: Core system defines interface for plugin communication

**Well-Typed Plugin Architecture**:
- Use TypeScript's type system to enforce plugin dependencies
- Generate type-safe APIs for plugin communication
- Static type-checking catches plugin compatibility issues at compile time

**Source**: "Towards a well-typed plugin architecture" and DEV Community article on plugin systems

#### 5.2 Registry Pattern

The **Registry Pattern** enables dynamic plugin discovery:
- Central registry maps plugin IDs to implementations
- Plugins self-register at initialization
- Runtime lookup by ID or capabilities
- Validation during registration

**Source**: Multiple TypeScript design pattern resources

#### 5.3 Factory Pattern for Instantiation

**Factory Pattern** complements registry for plugin creation:
- Encapsulates complex adapter instantiation logic
- Validates configuration before creation
- Enables different adapter types (local vs hosted)
- Centralizes dependency injection

**Source**: Factory Design Pattern in TypeScript articles

#### 5.4 Microsoft TypeScript Plugin Example

TypeScript Language Service uses Decorator Pattern for plugins:
- Plugins wrap the main Language Service
- Given a Language Service instance, plugins return a new decorator wrapping it
- Enables composable plugin chains

**Source**: Microsoft TypeScript Wiki - Writing a Language Service Plugin

### Decision: Registry + Factory Pattern for Extensibility

**Chosen Approach**: Adapter registry with factory-based instantiation

```typescript
/**
 * Adapter factory for creating instances
 */
interface IAdapterFactory {
  /**
   * Unique identifier for this factory (e.g., "onnx", "openai")
   */
  readonly id: string;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * Supported configuration types
   */
  readonly supportedConfigTypes: string[];

  /**
   * Create an adapter instance from configuration
   * @returns Result with adapter or error
   */
  create(config: AdapterConfig): Result<IEmbeddingAdapter, AdapterError>;

  /**
   * Validate configuration before creation
   */
  validateConfig(config: AdapterConfig): Result<void, ConfigError>;
}

/**
 * Registry for managing available adapter factories
 */
class AdapterRegistry {
  private factories = new Map<string, IAdapterFactory>();
  private instances = new Map<string, IEmbeddingAdapter>();

  /**
   * Register a new adapter factory
   * @throws if factory ID already registered
   */
  register(factory: IAdapterFactory): Result<void, RegistryError> {
    if (this.factories.has(factory.id)) {
      return Err(new RegistryError(
        `Adapter factory "${factory.id}" is already registered`
      ));
    }

    this.factories.set(factory.id, factory);
    return Ok(undefined);
  }

  /**
   * Unregister an adapter factory
   */
  unregister(factoryId: string): void {
    this.factories.delete(factoryId);
    // Clean up any instances created by this factory
    for (const [instanceId, adapter] of this.instances.entries()) {
      if (adapter.id.startsWith(factoryId)) {
        adapter.dispose();
        this.instances.delete(instanceId);
      }
    }
  }

  /**
   * Get or create an adapter instance
   */
  getOrCreateAdapter(
    factoryId: string,
    config: AdapterConfig,
    instanceId?: string
  ): Result<IEmbeddingAdapter, AdapterError> {
    const cacheKey = instanceId || `${factoryId}:default`;

    // Return existing instance if available
    const existing = this.instances.get(cacheKey);
    if (existing) {
      return Ok(existing);
    }

    // Find factory
    const factory = this.factories.get(factoryId);
    if (!factory) {
      return Err(new AdapterError(
        `No adapter factory registered for "${factoryId}". ` +
        `Available factories: ${Array.from(this.factories.keys()).join(', ')}`
      ));
    }

    // Validate configuration
    const validation = factory.validateConfig(config);
    if (validation.isErr()) {
      return Err(new AdapterError(
        `Invalid configuration for factory "${factoryId}": ${validation.error.message}`
      ));
    }

    // Create new instance
    const result = factory.create(config);
    if (result.isErr()) {
      return result;
    }

    // Cache instance
    const adapter = result.value;
    this.instances.set(cacheKey, adapter);

    return Ok(adapter);
  }

  /**
   * List all registered factories
   */
  listFactories(): FactoryInfo[] {
    return Array.from(this.factories.values()).map(factory => ({
      id: factory.id,
      name: factory.name,
      supportedConfigTypes: factory.supportedConfigTypes
    }));
  }

  /**
   * Dispose all adapter instances
   */
  async disposeAll(): Promise<void> {
    const disposals = Array.from(this.instances.values()).map(adapter =>
      adapter.dispose()
    );
    await Promise.all(disposals);
    this.instances.clear();
  }
}

/**
 * Factory for ONNX local adapters
 */
class OnnxAdapterFactory implements IAdapterFactory {
  readonly id = 'onnx';
  readonly name = 'ONNX Runtime Local Models';
  readonly supportedConfigTypes = ['onnx'];

  create(config: AdapterConfig): Result<IEmbeddingAdapter, AdapterError> {
    if (config.type !== 'onnx') {
      return Err(new AdapterError(
        `OnnxAdapterFactory only supports type "onnx", got "${config.type}"`
      ));
    }

    const onnxConfig = config as OnnxAdapterConfig;

    try {
      const adapter = new OnnxEmbeddingAdapter(onnxConfig);
      return Ok(adapter);
    } catch (error) {
      return Err(new AdapterInitializationError(
        `Failed to create ONNX adapter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      ));
    }
  }

  validateConfig(config: AdapterConfig): Result<void, ConfigError> {
    if (config.type !== 'onnx') {
      return Err(new ConfigError(`Expected type "onnx", got "${config.type}"`));
    }

    const onnxConfig = config as OnnxAdapterConfig;

    if (!onnxConfig.modelPath) {
      return Err(new ConfigError('Missing required field: modelPath'));
    }

    // Additional validation...

    return Ok(undefined);
  }
}

/**
 * Factory for hosted API adapters
 */
class HostedAdapterFactory implements IAdapterFactory {
  readonly id = 'hosted';
  readonly name = 'Hosted API Models';
  readonly supportedConfigTypes = ['openai', 'anthropic', 'custom'];

  create(config: AdapterConfig): Result<IEmbeddingAdapter, AdapterError> {
    const hostedConfig = config as HostedAdapterConfig;

    switch (hostedConfig.type) {
      case 'openai':
        return this.createOpenAIAdapter(hostedConfig);
      case 'anthropic':
        return this.createAnthropicAdapter(hostedConfig);
      case 'custom':
        return this.createCustomAdapter(hostedConfig);
      default:
        return Err(new AdapterError(
          `Unsupported hosted adapter type: ${hostedConfig.type}`
        ));
    }
  }

  validateConfig(config: AdapterConfig): Result<void, ConfigError> {
    const hostedConfig = config as HostedAdapterConfig;

    if (!hostedConfig.endpoint) {
      return Err(new ConfigError('Missing required field: endpoint'));
    }

    if (!hostedConfig.apiKey) {
      return Err(new ConfigError('Missing required field: apiKey'));
    }

    return Ok(undefined);
  }

  private createOpenAIAdapter(
    config: HostedAdapterConfig
  ): Result<IEmbeddingAdapter, AdapterError> {
    try {
      const adapter = new OpenAIEmbeddingAdapter(config);
      return Ok(adapter);
    } catch (error) {
      return Err(new AdapterInitializationError(
        `Failed to create OpenAI adapter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      ));
    }
  }

  private createAnthropicAdapter(
    config: HostedAdapterConfig
  ): Result<IEmbeddingAdapter, AdapterError> {
    // Similar to OpenAI
    throw new Error('Not implemented');
  }

  private createCustomAdapter(
    config: HostedAdapterConfig
  ): Result<IEmbeddingAdapter, AdapterError> {
    // Generic HTTP adapter for custom endpoints
    throw new Error('Not implemented');
  }
}

/**
 * Global singleton registry instance
 */
export const adapterRegistry = new AdapterRegistry();

// Register built-in factories
adapterRegistry.register(new OnnxAdapterFactory());
adapterRegistry.register(new HostedAdapterFactory());

/**
 * Example: User-defined custom adapter
 */
class MyCustomAdapterFactory implements IAdapterFactory {
  readonly id = 'my-custom';
  readonly name = 'My Custom Embedding Service';
  readonly supportedConfigTypes = ['custom'];

  create(config: AdapterConfig): Result<IEmbeddingAdapter, AdapterError> {
    // Custom implementation...
    throw new Error('Not implemented');
  }

  validateConfig(config: AdapterConfig): Result<void, ConfigError> {
    // Custom validation...
    return Ok(undefined);
  }
}

// User registers their custom adapter
adapterRegistry.register(new MyCustomAdapterFactory());

/**
 * High-level service using the registry
 */
class EmbeddingService {
  private currentAdapter?: IEmbeddingAdapter;

  constructor(
    private registry: AdapterRegistry,
    private configManager: ConfigurationManager
  ) {}

  /**
   * Initialize with a specific model
   */
  async initialize(
    model: string = 'default'
  ): Promise<Result<void, AdapterError>> {
    // Load configuration
    const configResult = this.configManager.getAdapterConfig(model);
    if (configResult.isErr()) {
      return Err(new AdapterError(
        `Configuration error: ${configResult.error.message}`
      ));
    }

    const config = configResult.value;

    // Determine factory ID from config type
    const factoryId = config.type === 'onnx' ? 'onnx' : 'hosted';

    // Get or create adapter
    const adapterResult = this.registry.getOrCreateAdapter(
      factoryId,
      config,
      model
    );

    if (adapterResult.isErr()) {
      return Err(adapterResult.error);
    }

    this.currentAdapter = adapterResult.value;

    // Initialize the adapter
    return this.currentAdapter.initialize();
  }

  /**
   * Generate embeddings using current adapter
   */
  async embed(
    texts: string[],
    options?: EmbedOptions
  ): Promise<Result<EmbeddingBatch, AdapterError>> {
    if (!this.currentAdapter) {
      return Err(new AdapterError('No adapter initialized. Call initialize() first.'));
    }

    return this.currentAdapter.embed(texts, options);
  }

  /**
   * List available models from registry
   */
  listAvailableModels(): FactoryInfo[] {
    return this.registry.listFactories();
  }
}
```

**Rationale**:
- **Registry pattern**: Centralized management of adapter factories
- **Factory pattern**: Encapsulates complex instantiation logic
- **Lazy instantiation**: Adapters created only when needed
- **Caching**: Reuse adapter instances to avoid reinitialization
- **Validation**: Check configuration before creating expensive resources
- **Extensibility**: Users register custom factories with minimal code

**Alternatives Considered**:

1. **Hardcoded adapter types** ❌
   - Rejected: Not extensible, requires code changes for new adapters

2. **Dynamic import of adapter modules** ⚠️
   - Considered: More flexible but complex, security concerns with arbitrary code execution

3. **Decorator pattern for adapter chains** ⚠️
   - Considered: Useful for middleware (logging, caching) but adds complexity

**Extension Points for Users**:

1. **Custom Adapter Factory**: Implement `IAdapterFactory` and register
2. **Custom Adapter**: Implement `IEmbeddingAdapter` interface directly
3. **Adapter Middleware**: Wrap existing adapters (logging, caching, monitoring)

**Documentation Requirements**:
- Clear guide on implementing `IAdapterFactory`
- Example custom adapter with full implementation
- Configuration schema documentation
- Contract test suite for validation

---

## Summary of Decisions

| Area | Decision | Key Libraries/Patterns |
|------|----------|------------------------|
| **Interface Design** | Strategy Pattern with minimal, well-typed adapter interface | TypeScript interfaces, async/await |
| **Error Handling** | Result monad + exponential backoff + circuit breaker | `neverthrow`, custom retry logic |
| **Configuration** | Layered config with environment variables | `dotenv`, typed configuration classes |
| **Testing** | Contract tests + mock adapters + property-based tests | Vitest, abstract test suites |
| **Extensibility** | Registry + Factory pattern for plugin management | Custom registry, factory interfaces |

---

## Implementation Checklist

### Phase 0: Foundation (P1)
- [ ] Define `IEmbeddingAdapter` interface
- [ ] Create `AdapterError` hierarchy
- [ ] Implement Result type wrappers (use `neverthrow`)
- [ ] Build configuration manager with `.env` support

### Phase 1: Core Adapters (P1)
- [ ] Implement `OnnxEmbeddingAdapter` for local models
- [ ] Implement `MockEmbeddingAdapter` for testing
- [ ] Create adapter contract test suite
- [ ] Build retry + circuit breaker logic

### Phase 2: Registry System (P2)
- [ ] Implement `AdapterRegistry` class
- [ ] Create `IAdapterFactory` interface
- [ ] Build `OnnxAdapterFactory`
- [ ] Add factory discovery and validation

### Phase 3: Hosted Adapters (P3)
- [ ] Implement `HostedAdapterFactory`
- [ ] Create `OpenAIEmbeddingAdapter`
- [ ] Add rate limiting and authentication
- [ ] Test with real API credentials

### Phase 4: Documentation (P2)
- [ ] Write custom adapter guide
- [ ] Create configuration examples
- [ ] Document error codes and handling
- [ ] Provide testing best practices

---

## Open Questions

1. **Model Distribution**: How should ONNX model files be distributed? Package with npm? Download on first use? User-provided?

2. **Version Compatibility**: How to handle breaking changes in the adapter interface? Versioned interfaces?

3. **Performance Monitoring**: Should adapters expose metrics (latency, throughput)? If so, standardized interface?

4. **Multi-Model Scenarios**: Should system support multiple adapters simultaneously for A/B testing or fallback?

5. **Adapter Marketplace**: Future consideration for community-contributed adapters? Security implications?

---

## References

### Design Patterns
- [Refactoring Guru - Strategy Pattern in TypeScript](https://refactoring.guru/design-patterns/strategy/typescript/example)
- [Factory Design Pattern in TypeScript](https://blog.bitsrc.io/factory-design-pattern-in-typescript-55a91d74f3a4)
- [Circuit Breaker Pattern in TypeScript](https://www.squash.io/tutorial-on-circuit-breaker-pattern-in-typescript/)

### Error Handling
- [Functional Error Handling in TypeScript with the Result Pattern](https://arg-software.medium.com/functional-error-handling-in-typescript-with-the-result-pattern-5b96a5abb6d3)
- [Simplify TypeScript Error Handling with the Attempt Pattern](https://radzion.com/blog/attempt/)
- [AWS Prescriptive Guidance - Retry with Backoff Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html)

### Dependency Injection
- [TypeScript + Node.js Enterprise Patterns](https://medium.com/slalom-build/typescript-node-js-enterprise-patterns-630df2c06c35)
- [Top 5 TypeScript Dependency Injection Containers](https://www.somethingsblog.com/2024/10/22/typescript-dependency-injection-top-5-containers/)

### Testing
- [Mocking Objects in TypeScript Tests](https://medium.com/@tomas.madajevas/mocking-objects-in-typescrip-tests-7fd06637c362)
- [Contract Testing with TypeScript](https://danieljharvey.github.io/posts/2020-02-23-typescript-contract-tests.html)
- [Strengthening Pact Contract Testing with TypeScript](https://dev.to/muratkeremozcan/-strengthening-pact-contract-testing-with-typescript-and-data-abstraction-16hc)

### Plugin Architecture
- [Towards a Well-Typed Plugin Architecture](https://code.lol/post/programming/plugin-architecture/)
- [Designing a Plugin System in TypeScript for Modular Web Applications](https://dev.to/hexshift/designing-a-plugin-system-in-typescript-for-modular-web-applications-4db5)
- [LangChain.js Architecture Documentation](https://js.langchain.com/docs/introduction/)

### Configuration Management
- [TypeScript + GCP Secret Manager + Firebase - Better Credential Management](https://medium.com/@shashkiranr/typescript-gcp-secret-manager-firebase-app-engine-multiple-environment-better-credential-45198f3e53e)
- [Using TypeScript with AWS Secrets Manager](https://www.webdevtutor.net/blog/typescript-aws-secrets-manager)

---

**Next Steps**: Proceed to Phase 1 (data-model.md) to define entity structures and SQLite schema for the embedding layer.
