/**
 * CSP requirements for @adieuu/crypto.
 *
 * hash-wasm (used for Argon2id KDF) compiles WebAssembly at runtime,
 * requiring `'wasm-unsafe-eval'` in `script-src`. This is narrowly
 * scoped to `WebAssembly.compile()` / `WebAssembly.instantiate()` and
 * does NOT grant general `eval()` capability.
 *
 * @module crypto/csp
 */

export const cryptoCspManifest: Record<string, string[]> = {
  'script-src': ["'wasm-unsafe-eval'"],
};
