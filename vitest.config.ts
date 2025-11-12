import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{git,cache}/**'],

    // Environment
    environment: 'node',
    globals: false, // Don't inject globals - explicit imports for modern pattern

    // Execution
    pool: 'forks',
    fileParallelism: true,
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporters
    reporters: ['default'],

    // Coverage with v8 (modern, fast)
    coverage: {
      provider: 'v8',
      enabled: false, // Enable explicitly with --coverage
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/**',
        '**/index.ts', // Main entry point
      ],
      thresholds: {
        // Global thresholds
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // Critical files - 100% coverage required
        'src/server/core/watcher.ts': { 100: true },
        'src/server/core/coordinator.ts': { 100: true },
      },
    },

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,

    // Type checking
    typecheck: {
      enabled: false, // We use tsc for type checking
    },
  },
});
