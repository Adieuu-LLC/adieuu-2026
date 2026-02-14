/**
 * Timing utilities
 * Jitter and delays for security (anti-enumeration, timing attack protection)
 */

/**
 * Add random jitter delay to prevent timing-based enumeration attacks
 * 
 * @param minMs - Minimum delay in milliseconds (default 100)
 * @param maxMs - Maximum delay in milliseconds (default 500)
 */
export async function addJitter(minMs = 100, maxMs = 500): Promise<void> {
  const jitter = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await Bun.sleep(jitter);
}

/**
 * Ensure a function takes at least a minimum amount of time
 * Useful for preventing timing attacks on operations like login
 * 
 * @param fn - The function to execute
 * @param minTimeMs - Minimum execution time in milliseconds
 * @returns The result of the function
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

