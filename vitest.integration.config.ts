import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pipeline/test/integration/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
