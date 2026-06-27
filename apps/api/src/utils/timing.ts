/**
 * Timing Utilities Module
 * 
 * Provides timing-related security functions to prevent enumeration
 * and timing attacks. These utilities ensure that response times don't
 * leak information about the success or failure of operations.
 * 
 * @module utils/timing
 * 
 * @example
 * ```typescript
 * import { addJitter, withMinimumTime } from './timing';
 * 
 * // Add random delay to prevent timing analysis
 * await addJitter();
 * 
 * // Ensure operation takes at least 500ms
 * const result = await withMinimumTime(() => checkPassword(input), 500);
 * ```
 */

/**
 * Adds a random delay to prevent timing-based enumeration attacks.
 * 
 * Introduces a random sleep between minMs and maxMs milliseconds.
 * This makes it difficult for attackers to determine whether an
 * operation succeeded or failed based on response time.
 * 
 * Common use cases:
 * - Login endpoints (hide whether user exists)
 * - OTP verification (hide whether code was close to correct)
 * - Password reset (hide whether email exists)
 * 
 * @param minMs - Minimum delay in milliseconds (default: 100)
 * @param maxMs - Maximum delay in milliseconds (default: 500)
 * @returns Promise that resolves after the random delay
 * 
 * @example
 * ```typescript
 * // Default jitter (100-500ms)
 * await addJitter();
 * 
 * // Custom range (50-150ms)
 * await addJitter(50, 150);
 * 
 * // Use in authentication flow
 * async function handleLogin(email: string, password: string) {
 *   const result = await verifyCredentials(email, password);
 *   await addJitter(); // Normalize response time
 *   return result;
 * }
 * ```
 */
export async function addJitter(minMs = 100, maxMs = 500): Promise<void> {
  const jitter = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await Bun.sleep(jitter);
}

/**
 * Ensures a function takes at least a minimum amount of time to execute.
 * 
 * Wraps an async function and pads the execution time if it completes
 * faster than the specified minimum. This prevents timing attacks where
 * attackers measure response times to infer information.
 * 
 * If the function takes longer than minTimeMs, no additional delay is added.
 * 
 * @typeParam T - The return type of the wrapped function
 * @param fn - The async function to wrap
 * @param minTimeMs - Minimum execution time in milliseconds
 * @returns The result of the wrapped function
 * 
 * @example
 * ```typescript
 * // Ensure password check always takes at least 200ms
 * const isValid = await withMinimumTime(
 *   () => checkPassword(input, storedHash),
 *   200
 * );
 * 
 * // Normalize OTP verification time
 * const result = await withMinimumTime(async () => {
 *   const stored = await getStoredOtp(userId);
 *   if (!stored) return { valid: false, error: 'not_found' };
 *   return verifyOtp(input, stored);
 * }, 300);
 * ```
 */
export async function withMinimumTime<T>(
  fn: () => Promise<T>,
  minTimeMs: number
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;

  if (elapsed < minTimeMs) {
    await Bun.sleep(minTimeMs - elapsed);
  }

  return result;
}
