import { describe, expect, test, spyOn, beforeEach, afterEach } from 'bun:test';
import adieuuLogger, { adieuuLogger as namedExport } from './adieuuLogger';

describe('adieuuLogger', () => {
  describe('exports', () => {
    test('default export is defined', () => {
      expect(adieuuLogger).toBeDefined();
    });

    test('named export is defined', () => {
      expect(namedExport).toBeDefined();
    });

    test('default and named exports are the same instance', () => {
      expect(adieuuLogger).toBe(namedExport);
    });
  });

  describe('logger instance', () => {
    test('is a Winston logger with expected methods', () => {
      expect(typeof adieuuLogger.info).toBe('function');
      expect(typeof adieuuLogger.error).toBe('function');
      expect(typeof adieuuLogger.warn).toBe('function');
      expect(typeof adieuuLogger.debug).toBe('function');
      expect(typeof adieuuLogger.verbose).toBe('function');
      expect(typeof adieuuLogger.silly).toBe('function');
      expect(typeof adieuuLogger.log).toBe('function');
    });

    test('has transports configured', () => {
      expect(adieuuLogger.transports).toBeDefined();
      expect(adieuuLogger.transports.length).toBeGreaterThan(0);
    });

    test('has console transport', () => {
      const consoleTransport = adieuuLogger.transports.find(
        (t) => t.constructor.name === 'Console'
      );
      expect(consoleTransport).toBeDefined();
    });

    test('has default meta with service name', () => {
      expect(adieuuLogger.defaultMeta).toBeDefined();
      expect(adieuuLogger.defaultMeta).toHaveProperty('service', 'adieuu-api');
    });
  });

  describe('logging methods', () => {
    let consoleWriteSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      // Spy on process.stdout.write to capture console output
      consoleWriteSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      consoleWriteSpy.mockRestore();
    });

    test('info() logs without throwing', () => {
      expect(() => adieuuLogger.info('Test info message')).not.toThrow();
    });

    test('error() logs without throwing', () => {
      expect(() => adieuuLogger.error('Test error message')).not.toThrow();
    });

    test('warn() logs without throwing', () => {
      expect(() => adieuuLogger.warn('Test warn message')).not.toThrow();
    });

    test('debug() logs without throwing', () => {
      expect(() => adieuuLogger.debug('Test debug message')).not.toThrow();
    });

    test('verbose() logs without throwing', () => {
      expect(() => adieuuLogger.verbose('Test verbose message')).not.toThrow();
    });

    test('silly() logs without throwing', () => {
      expect(() => adieuuLogger.silly('Test silly message')).not.toThrow();
    });

    test('log() with level logs without throwing', () => {
      expect(() => adieuuLogger.log('info', 'Test log message')).not.toThrow();
    });

    test('info() with object metadata logs without throwing', () => {
      expect(() => adieuuLogger.info('Test message', { key: 'value', num: 123 })).not.toThrow();
    });

    test('error() with Error object logs without throwing', () => {
      const error = new Error('Test error');
      expect(() => adieuuLogger.error('An error occurred', error)).not.toThrow();
    });

    test('info() with nested object logs without throwing', () => {
      expect(() => adieuuLogger.info('Complex data', {
        user: { id: 1, name: 'test' },
        items: [1, 2, 3],
        nested: { deep: { value: true } },
      })).not.toThrow();
    });
  });

  describe('console transport configuration', () => {
    test('console transport handles exceptions', () => {
      const consoleTransport = adieuuLogger.transports.find(
        (t) => t.constructor.name === 'Console'
      );
      // Winston Console transport has handleExceptions property
      expect(consoleTransport).toBeDefined();
      if (consoleTransport) {
        expect((consoleTransport as { handleExceptions?: boolean }).handleExceptions).toBe(true);
      }
    });

    test('console transport handles rejections', () => {
      const consoleTransport = adieuuLogger.transports.find(
        (t) => t.constructor.name === 'Console'
      );
      expect(consoleTransport).toBeDefined();
      if (consoleTransport) {
        expect((consoleTransport as { handleRejections?: boolean }).handleRejections).toBe(true);
      }
    });
  });

  describe('log output format', () => {
    let originalWrite: typeof process.stdout.write;
    let capturedOutput: string[];

    beforeEach(() => {
      capturedOutput = [];
      originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array) => {
        if (typeof chunk === 'string') {
          capturedOutput.push(chunk);
        }
        return true;
      }) as typeof process.stdout.write;
    });

    afterEach(() => {
      process.stdout.write = originalWrite;
    });

    test('log output is valid JSON', () => {
      adieuuLogger.info('JSON test');
      
      const output = capturedOutput.join('').trim();
      expect(() => JSON.parse(output)).not.toThrow();
    });

    test('log output contains ISO timestamp', () => {
      adieuuLogger.info('Timestamp test');
      
      const output = capturedOutput.join('').trim();
      const parsed = JSON.parse(output);
      expect(parsed.timestamp).toBeDefined();
      // ISO format: 2026-01-28T14:32:45.123+0000
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    test('log output contains level field', () => {
      adieuuLogger.info('Level test');
      
      const output = capturedOutput.join('').trim();
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('info');
    });

    test('log output contains message field', () => {
      const testMessage = 'UniqueTestMessage12345';
      adieuuLogger.info(testMessage);
      
      const output = capturedOutput.join('').trim();
      const parsed = JSON.parse(output);
      expect(parsed.message).toBe(testMessage);
    });

    test('log output contains service field', () => {
      adieuuLogger.info('Service test');
      
      const output = capturedOutput.join('').trim();
      const parsed = JSON.parse(output);
      expect(parsed.service).toBe('adieuu-api');
    });

    test('error log output has level "error"', () => {
      adieuuLogger.error('Error level test');
      
      const output = capturedOutput.join('').trim();
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('error');
    });

    test('warn log output has level "warn"', () => {
      adieuuLogger.warn('Warn level test');
      
      const output = capturedOutput.join('').trim();
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('warn');
    });

    test('metadata object is flattened into JSON output', () => {
      adieuuLogger.info('Meta test', { userId: '123', action: 'login' });
      
      const output = capturedOutput.join('').trim();
      const parsed = JSON.parse(output);
      expect(parsed.userId).toBe('123');
      expect(parsed.action).toBe('login');
    });
  });

  describe('edge cases', () => {
    let consoleWriteSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleWriteSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      consoleWriteSpy.mockRestore();
    });

    test('handles empty string message', () => {
      expect(() => adieuuLogger.info('')).not.toThrow();
    });

    test('handles undefined as second argument', () => {
      expect(() => adieuuLogger.info('Message', undefined)).not.toThrow();
    });

    test('handles null as second argument', () => {
      expect(() => adieuuLogger.info('Message', null as unknown as object)).not.toThrow();
    });

    test('handles circular reference in metadata', () => {
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;
      // Winston handles circular references gracefully
      expect(() => adieuuLogger.info('Circular test', circular)).not.toThrow();
    });

    test('handles very long message', () => {
      const longMessage = 'x'.repeat(10000);
      expect(() => adieuuLogger.info(longMessage)).not.toThrow();
    });

    test('handles special characters in message', () => {
      expect(() => adieuuLogger.info('Special chars: \n\t\r\0')).not.toThrow();
    });

    test('handles unicode in message', () => {
      expect(() => adieuuLogger.info('Unicode: \u4E2D\u6587 \uD83D\uDE00')).not.toThrow();
    });

    test('handles multiple sequential logs', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          adieuuLogger.info(`Log message ${i}`);
        }
      }).not.toThrow();
    });
  });
});
