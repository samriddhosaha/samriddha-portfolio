import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT || 4310);
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/prep-test.mjs && node dev/server.mjs',
    port: PORT,
    reuseExistingServer: false,
    env: { PORT: String(PORT), TURSO_DATABASE_URL: 'file:.data/test.db', NODE_ENV: 'test', SESSION_SECRET: 'test-secret-test-secret-test-secret', ADMIN_PASSWORD: 'test-password', OWNER_EMAIL: 'owner@example.com', SITE_URL: `http://localhost:${PORT}` },
  },
});
