import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./src/test-setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      include: ['src/app/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      thresholds: {
        'src/app/core/guards/auth.guard.ts': {
          statements: 87.5,
          branches: 64.28,
          functions: 90.9,
          lines: 86.84,
        },
        'src/app/core/services/auth.service.ts': {
          statements: 89.1,
          branches: 70.52,
          functions: 89.53,
          lines: 88.68,
        },
        'src/app/core/services/pending-personal-session-storage.service.ts': {
          statements: 100,
          branches: 94.11,
          functions: 100,
          lines: 100,
        },
        'src/app/views/item-explorer/item-explorer-preview-coordinator.service.ts': {
          statements: 89.28,
          branches: 81.81,
          functions: 94.44,
          lines: 89.09,
        },
        'src/app/views/item-explorer/item-explorer-preview-loader.service.ts': {
          statements: 98.93,
          branches: 89.13,
          functions: 100,
          lines: 100,
        },
        'src/app/views/item-explorer/item-explorer.facade.ts': {
          statements: 72.41,
          branches: 64.28,
          functions: 77.91,
          lines: 75.53,
        },
      },
    },
  },
});
