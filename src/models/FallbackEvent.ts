/**
 * Fallback Event Model
 *
 * Represents a single fallback action taken by the system.
 */

import { EmbeddingProfile } from './EmbeddingProfile.js';

export type FallbackAction =
  | 'reduce_batch'
  | 'switch_device'
  | 'switch_model'
  | 'switch_quantization';

export type FallbackLevel = 'warn' | 'error';

export interface FallbackEvent {
  /** When fallback occurred */
  timestamp: Date;

  /** Event level (warn, error) */
  level: FallbackLevel;

  /** Type of fallback action */
  action: FallbackAction;

  /** Configuration before fallback */
  from: Partial<EmbeddingProfile>;

  /** Configuration after fallback */
  to: Partial<EmbeddingProfile>;

  /** Why fallback was triggered */
  reason: string;

  /** Whether fallback resolved the issue */
  success: boolean;
}

/**
 * Validates fallback event structure
 */
export function validateFallbackEvent(
  event: Partial<FallbackEvent>
): event is FallbackEvent {
  const validActions: FallbackAction[] = [
    'reduce_batch',
    'switch_device',
    'switch_model',
    'switch_quantization'
  ];
  const validLevels: FallbackLevel[] = ['warn', 'error'];

  return (
    event.timestamp instanceof Date &&
    typeof event.level === 'string' &&
    validLevels.includes(event.level as FallbackLevel) &&
    typeof event.action === 'string' &&
    validActions.includes(event.action as FallbackAction) &&
    typeof event.from === 'object' &&
    event.from !== null &&
    typeof event.to === 'object' &&
    event.to !== null &&
    typeof event.reason === 'string' &&
    event.reason.length > 0 &&
    typeof event.success === 'boolean'
  );
}

/**
 * Serializes fallback event to JSON Lines format
 */
export function serializeFallbackEvent(event: FallbackEvent): string {
  return JSON.stringify({
    timestamp: event.timestamp.toISOString(),
    level: event.level,
    action: event.action,
    from: event.from,
    to: event.to,
    reason: event.reason,
    success: event.success
  });
}

/**
 * Deserializes fallback event from JSON
 */
export function deserializeFallbackEvent(json: string): FallbackEvent {
  const obj = JSON.parse(json);
  return {
    ...obj,
    timestamp: new Date(obj.timestamp)
  };
}
