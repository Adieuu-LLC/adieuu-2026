/**
 * Chat Service Logger
 *
 * Provides structured JSON logging via Winston for the chat service.
 */

import { createLogger, transports, format } from 'winston';
import Transport from 'winston-transport';

const flattenMeta = format((info) => {
  const splat = info[Symbol.for('splat') as unknown as string] as unknown[];
  if (splat && Array.isArray(splat) && splat.length > 0) {
    const meta = splat[0];
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      Object.assign(info, meta);
    }
  }
  return info;
});

const chatTransports: Transport[] = [
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

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: chatTransports,
  defaultMeta: {
    service: 'adieuu-chat',
  },
});

export default logger;
