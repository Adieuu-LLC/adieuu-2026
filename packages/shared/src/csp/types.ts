/**
 * Structured representation of Content Security Policy directives.
 *
 * Keys are directive names (e.g. `script-src`, `style-src`); values are
 * arrays of source expressions (e.g. `["'self'", "'wasm-unsafe-eval'"]`).
 *
 * @module csp/types
 */

export type CspDirectives = Record<string, string[]>;
