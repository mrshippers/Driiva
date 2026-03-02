import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: {} },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/types.ts'],
    },
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
