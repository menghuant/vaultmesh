import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'server/**/*.test.ts',
      'daemon/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '.claude/**',
      'dist/**',
    ],
    testTimeout: 10000,
  },
})
