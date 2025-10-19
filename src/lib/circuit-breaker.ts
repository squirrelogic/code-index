/**
 * Circuit Breaker Pattern
 *
 * Provides circuit breaker functionality to prevent cascading failures.
 * Based on research.md lines 357-416
 */

import { Result, err } from 'neverthrow';
import { AdapterError, AdapterInitializationError } from '../services/embedding/adapter-interface.js';

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	/** Number of failures before opening circuit */
	failureThreshold: number;

	/** Time in milliseconds before attempting reset */
	resetTimeoutMs: number;

	/** Number of successes in half-open state before closing */
	halfOpenSuccessThreshold: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 5,
	resetTimeoutMs: 60000, // 1 minute
	halfOpenSuccessThreshold: 2,
};

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
	/** Current state */
	state: CircuitState;

	/** Number of consecutive failures */
	failureCount: number;

	/** Number of consecutive successes in half-open state */
	successCount: number;

	/** Last failure timestamp */
	lastFailureTime?: Date;

	/** Total number of calls */
	totalCalls: number;

	/** Total number of failures */
	totalFailures: number;

	/** Total number of successes */
	totalSuccesses: number;

	/** Total number of calls rejected due to open circuit */
	totalRejected: number;
}

/**
 * Circuit Breaker
 *
 * Prevents cascading failures by temporarily suspending requests when
 * a service appears to be failing.
 *
 * States:
 * - Closed: Normal operation, requests pass through
 * - Open: Service is failing, requests are rejected immediately
 * - Half-Open: Testing if service has recovered
 */
export class CircuitBreaker {
	private state: CircuitState = 'closed';
	private failureCount = 0;
	private successCount = 0;
	private lastFailureTime?: Date;
	private stats: CircuitBreakerStats;

	constructor(
		private name: string,
		private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG
	) {
		this.stats = {
			state: 'closed',
			failureCount: 0,
			successCount: 0,
			totalCalls: 0,
			totalFailures: 0,
			totalSuccesses: 0,
			totalRejected: 0,
		};
	}

	/**
	 * Execute a function with circuit breaker protection
	 *
	 * @param fn - Function to execute
	 * @returns Result from function or circuit breaker error
	 */
	async execute<T>(
		fn: () => Promise<Result<T, AdapterError>>
	): Promise<Result<T, AdapterError>> {
		this.stats.totalCalls++;

		// Check if circuit is open
		if (this.state === 'open') {
			if (this.shouldAttemptReset()) {
				this.transitionTo('half-open');
			} else {
				this.stats.totalRejected++;
				return err(
					new AdapterInitializationError(
						`Circuit breaker "${this.name}" is open. Last failure: ${this.lastFailureTime?.toISOString() || 'unknown'}`
					)
				);
			}
		}

		// Execute the function
		const result = await fn();

		// Update circuit state based on result
		if (result.isOk()) {
			this.onSuccess();
		} else {
			this.onFailure();
		}

		return result;
	}

	/**
	 * Handle successful execution
	 */
	private onSuccess(): void {
		this.failureCount = 0;
		this.stats.totalSuccesses++;

		if (this.state === 'half-open') {
			this.successCount++;
			if (this.successCount >= this.config.halfOpenSuccessThreshold) {
				this.transitionTo('closed');
				this.successCount = 0;
			}
		}
	}

	/**
	 * Handle failed execution
	 */
	private onFailure(): void {
		this.failureCount++;
		this.stats.totalFailures++;
		this.lastFailureTime = new Date();
		this.successCount = 0;

		if (this.failureCount >= this.config.failureThreshold) {
			this.transitionTo('open');
		}
	}

	/**
	 * Check if enough time has passed to attempt reset
	 */
	private shouldAttemptReset(): boolean {
		if (!this.lastFailureTime) {
			return false;
		}

		const elapsed = Date.now() - this.lastFailureTime.getTime();
		return elapsed >= this.config.resetTimeoutMs;
	}

	/**
	 * Transition to a new state
	 */
	private transitionTo(newState: CircuitState): void {
		const oldState = this.state;
		this.state = newState;
		this.stats.state = newState;

		if (process.env.NODE_ENV !== 'test') {
			console.log(
				`  Circuit breaker "${this.name}": ${oldState} → ${newState}`
			);
		}
	}

	/**
	 * Get current circuit breaker statistics
	 */
	getStats(): CircuitBreakerStats {
		return {
			...this.stats,
			failureCount: this.failureCount,
			successCount: this.successCount,
			lastFailureTime: this.lastFailureTime,
		};
	}

	/**
	 * Get current circuit state
	 */
	getState(): CircuitState {
		return this.state;
	}

	/**
	 * Manually reset the circuit breaker
	 */
	reset(): void {
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailureTime = undefined;
		this.transitionTo('closed');
	}

	/**
	 * Manually open the circuit breaker
	 */
	open(): void {
		this.transitionTo('open');
	}
}

/**
 * Create a circuit breaker with custom configuration
 *
 * @param name - Name for the circuit breaker (for logging)
 * @param overrides - Partial configuration to override defaults
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker(
	name: string,
	overrides?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
	const config = {
		...DEFAULT_CIRCUIT_BREAKER_CONFIG,
		...overrides,
	};
	return new CircuitBreaker(name, config);
}
