/**
 * Adieuu Logger Module
 * 
 * Provides a structured JSON logging wrapper around Winston for consistent,
 * parseable log output. All logs include timestamps, service identification,
 * and flattened metadata for easy integration with log aggregation tools.
 * 
 * Output format (JSON):
 * ```json
 * {
 *   "level": "info",
 *   "message": "User logged in",
 *   "service": "adieuu-api",
 *   "timestamp": "2024-01-01T12:00:00.000Z",
 *   "userId": "123",
 *   "ip": "192.168.1.1"
 * }
 * ```
 * 
 * @module utils/adieuuLogger
 * 
 * @example
 * ```typescript
 * import elog from './adieuuLogger';
 * 
 * // Basic logging
 * elog.info('Server started');
 * elog.error('Database connection failed');
 * 
 * // With metadata (flattened into JSON output)
 * elog.info('User logged in', { userId: '123', ip: '192.168.1.1' });
 * elog.error('Request failed', { statusCode: 500, path: '/api/users' });
 * ```
 */

import { createLogger, transports, format } from 'winston';
import Transport from 'winston-transport';

/**
 * Custom format to flatten metadata objects into the log entry.
 * 
 * Ensures objects passed as the second argument to log methods are
 * included in the JSON output at the top level rather than nested.
 * Winston stores additional args in Symbol(splat).
 * 
 * @internal
 */
const flattenMeta = format((info) => {
  // If there's a metadata object, spread it into the log entry
  // Winston stores additional args in Symbol(splat)
  const splat = info[Symbol.for('splat') as unknown as string] as unknown[];
  if (splat && Array.isArray(splat) && splat.length > 0) {
    const meta = splat[0];
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      Object.assign(info, meta);
    }
  }
  return info;
});

/**
 * Console transport configuration with JSON formatting.
 * 
 * Configured to:
 * - Handle uncaught exceptions and promise rejections
 * - Include ISO timestamps
 * - Include stack traces for errors
 * - Flatten metadata into top-level JSON properties
 * - Output as single-line JSON for log aggregation
 * 
 * @internal
 */
const adieuuTransports: Transport[] = [
  new transports.Console({
    handleExceptions: true,
    handleRejections: true,
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
      format.errors({ stack: true }),
      flattenMeta(),
      format.json()
    ),
  }),
];

/**
 * Primary logging instance for the Adieuu API.
 * 
 * A Winston logger configured for structured JSON output suitable for
 * log aggregation services (CloudWatch, Datadog, ELK stack, etc.).
 * 
 * Features:
 * - Structured JSON output
 * - ISO timestamps on every log
 * - Automatic error stack traces
 * - Metadata flattening (objects become top-level properties)
 * - Handles uncaught exceptions and rejections
 * 
 * Log levels (in order of severity):
 * - error: Runtime errors requiring immediate attention
 * - warn: Potentially harmful situations
 * - info: General operational information
 * - debug: Detailed debugging information
 * - verbose: Even more detailed information
 * - silly: Most detailed logging level
 * 
 * @example
 * ```typescript
 * // Import as default or named export
 * import elog from './adieuuLogger';
 * import { adieuuLogger } from './adieuuLogger';
 * 
 * // Log levels
 * elog.error('Critical failure', { error: err });
 * elog.warn('Deprecated API used', { endpoint: '/old-api' });
 * elog.info('Request processed', { duration: 42 });
 * elog.debug('Cache hit', { key: 'user:123' });
 * 
 * // Output (single line, formatted here for readability):
 * // {
 * //   "level": "info",
 * //   "message": "Request processed",
 * //   "duration": 42,
 * //   "service": "adieuu-api",
 * //   "timestamp": "2024-01-01T12:00:00.000+0000"
 * // }
 * ```
 */
export const adieuuLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: adieuuTransports,
  defaultMeta: {
    service: 'adieuu-api',
  },
});

/**
 * Default export for convenient importing.
 * 
 * @example
 * ```typescript
 * import elog from './adieuuLogger';
 * elog.info('Hello world');
 * ```
 */
export default adieuuLogger;
