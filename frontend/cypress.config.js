import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
    fixturesFolder: 'cypress/fixtures',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    video: false,                  // 加快本地测试，要录像时改 true
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 6000,
    requestTimeout: 10000,
  },
  env: {
    apiBase: 'http://localhost:8000',
    testEmail: 'perftest@university.edu',
    testPassword: 'PerfTest123!',
    partnerEmail: 'perfpartner@university.edu',
  },
})
