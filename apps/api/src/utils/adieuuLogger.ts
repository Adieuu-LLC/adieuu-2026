import { createLogger, transports, format } from 'winston';
import Transport from 'winston-transport';

/**
 * Custom format to flatten metadata objects into the log entry.
 * Ensures objects passed as second argument to log methods are
 * included in the JSON output at the top level.
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
 * Create the console transport with JSON formatting
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
 * Primary logging wrapper for Adieuu, wraps Winston
 * 
 * Outputs structured JSON logs for easy parsing by log aggregation tools.
 * 
 * @example
 * ```typescript
 * elog.info('User logged in', { userId: '123', ip: '192.168.1.1' });
 * // Output: {"level":"info","message":"User logged in","userId":"123","ip":"192.168.1.1","service":"adieuu-api","timestamp":"2026-01-28T14:32:45.123+0000"}
 * 
 * elog.error('Database connection failed', { host: 'localhost', port: 5432 });
 * // Output: {"level":"error","message":"Database connection failed","host":"localhost","port":5432,"service":"adieuu-api","timestamp":"..."}
 * ```
 */
export const adieuuLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: adieuuTransports,
  defaultMeta: {
    service: 'adieuu-api',
  },
});

export default adieuuLogger;
