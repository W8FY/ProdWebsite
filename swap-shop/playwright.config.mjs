import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  reporter: 'list', outputDir: './test-results',
  use: { headless: true, ...(process.env.SWAP_BROWSER_CHANNEL ? { channel: process.env.SWAP_BROWSER_CHANNEL } : {}) }
});
