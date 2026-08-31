import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.js: the app config pulls in the React
// and PWA plugins, none of which the unit suite needs. Vitest prefers this file
// when both are present.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['shared/**/*.test.js', 'functions/**/*.test.js'],
  },
});
