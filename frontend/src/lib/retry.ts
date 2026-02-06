/**
 * Exponential backoff with jitter for network resilience.
 *
 * Formula: delay = min(baseDelay * 2^attempt, maxDelay) * (1 - jitter + random * jitter)
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number; // 0 to 1
}

export const RETRY_DEFAULTS: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.5,
};

/**
 * Calculate backoff delay for a given attempt with jitter.
 * Attempt is 0-indexed.
 */
export function calculateBackoff(
  attempt: number,
  config: Partial<RetryConfig> = {},
): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = {
    ...RETRY_DEFAULTS,
    ...config,
  };

  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Apply jitter: random value between (1 - jitter) and 1
  const jitter = 1 - jitterFactor + Math.random() * jitterFactor;
  return Math.round(cappedDelay * jitter);
}
