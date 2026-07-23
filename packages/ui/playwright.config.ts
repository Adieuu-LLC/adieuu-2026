import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = path.resolve(__dirname, 'tests/a11y/.auth/session.json');

export default defineConfig({
  timeout: 30_000,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm --filter @adieuu/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: '../..',
  },
  projects: [
    {
      name: 'setup',
      testDir: './tests/a11y',
      testMatch: 'auth.setup.ts',
    },
    {
      name: 'public',
      testDir: './tests/a11y',
      testMatch: 'page-audit.spec.ts',
    },
    {
      name: 'authenticated',
      testDir: './tests/a11y',
      testMatch: 'authenticated.spec.ts',
      dependencies: ['setup'],
      use: {
        storageState: AUTH_STATE,
      },
    },
    {
      name: 'compliance',
      testDir: './tests/compliance',
      testMatch: '**/*.spec.ts',
      dependencies: ['setup'],
      use: {
        storageState: AUTH_STATE,
      },
    },
    {
      name: 'crypto',
      testDir: './tests/crypto',
      testMatch: '**/*.spec.ts',
      dependencies: ['setup'],
      use: {
        storageState: AUTH_STATE,
      },
    },
  ],
});
