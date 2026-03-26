/**
 * Utility Module Exports
 * 
 * Central export point for all API utility functions. Import from this
 * module for convenient access to commonly used utilities.
 * 
 * @module utils
 * 
 * @example
 * ```typescript
 * import {
 *   // Response utilities
 *   success,
 *   error,
 *   errors,
 *   
 *   // Sanitization
 *   sanitizeString,
 *   
 *   // Cryptography
 *   generateOtp,
 *   hashOtp,
 *   hashIdentifier,
 *   constantTimeCompare,
 *   
 *   // Timing
 *   addJitter,
 *   withMinimumTime,
 *   
 *   // Logging
 *   elog,
 * } from './utils';
 * ```
 */

export * from './response';
export * from './sanitize';
export * from './crypto';
export * from './timing';
export * from './identity-hash';
export * from './isValidObjectId';

/**
 * Re-export the logger as both named exports.
 * 
 * - `adieuuLogger` - Full name export
 * - `elog` - Short alias for convenience
 * 
 * @example
 * ```typescript
 * import { elog } from './utils';
 * elog.info('Server started', { port: 4000 });
 * ```
 */
export { adieuuLogger, adieuuLogger as elog } from './adieuuLogger';
