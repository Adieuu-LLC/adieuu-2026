import { describe, expect, test } from 'bun:test';
import { ConsoleEmailProvider } from './console.provider';

describe('ConsoleEmailProvider', () => {
  test('send returns success with a console- prefixed messageId', async () => {
    const provider = new ConsoleEmailProvider();
    const result = await provider.send({
      to: 'user@example.com',
      subject: 'Test subject',
      text: 'Plain body',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^console-\d+-/);
  });

  test('send succeeds when html is included', async () => {
    const provider = new ConsoleEmailProvider();
    const result = await provider.send({
      to: 'user@example.com',
      subject: 'HTML',
      text: 'Plain',
      html: '<p>Rich</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });

  test('exposes name console', () => {
    expect(new ConsoleEmailProvider().name).toBe('console');
  });
});
