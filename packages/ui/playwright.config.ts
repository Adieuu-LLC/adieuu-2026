import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/a11y',
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
});
