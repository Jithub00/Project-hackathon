import { defineConfig, devices } from '@playwright/test';

// The e2e suite runs against the production build served by the Express server.
// The web server below starts on a fresh SQLite database that is seeded with demo data.
const PORT = 4100;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npx tsx server/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      DB_PATH: 'data/e2e.db',
      RESET_DB: '1',
      PAYMENT_MODE: 'demo',
      UPLOADS_DIR: 'data/e2e-uploads',
      DIST_DIR: 'dist',
      // Messaging: the moderator account used by the report test, and limits high enough for the scripted conversations.
      MODERATOR_EMAILS: 'moderator.e2e@example.com',
      // The reviewer account is created at startup with this password. Sign-up cannot create it.
      STAFF_BOOTSTRAP_EMAIL: 'moderator.e2e@example.com',
      STAFF_BOOTSTRAP_PASSWORD: 'Test-Password-2026',
      MESSAGE_SEND_LIMIT_PER_MINUTE: '600',
      CONVERSATION_START_LIMIT_PER_HOUR: '200',
      MESSAGE_STREAMS_PER_USER: '10',
    },
  },
});
