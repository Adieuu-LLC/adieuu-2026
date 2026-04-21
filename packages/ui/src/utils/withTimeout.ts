/**
 * Rejects if `promise` does not settle within `ms`. Clears the timer when the
 * promise settles normally or with an error.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = globalThis.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);
    promise.then(
      (v) => {
        globalThis.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        globalThis.clearTimeout(id);
        reject(e);
      }
    );
  });
}
