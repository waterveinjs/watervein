import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          include: ['packages/core/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'dom-core',
          include: ['packages/dom-core/tests/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
      {
        test: {
          name: 'dom',
          include: ['packages/dom/tests/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
    ],
  },
});