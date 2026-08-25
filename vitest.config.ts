import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['pipeline/test/integration/**', 'node_modules/**'],
  },
});
