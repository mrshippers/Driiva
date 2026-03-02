import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./client/src/__tests__/setup.ts'],
    include: [
      'client/src/**/*.test.{ts,tsx}',
      'functions/src/**/*.test.ts',
      'server/**/*.test.ts',
      'shared/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'functions/src/__tests__/triggers/damoovRegistration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: [
        'client/src/lib/**',
        'functions/src/utils/**',
        'shared/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
