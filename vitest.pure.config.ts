import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: [
      'src/**/*.pure.test.ts',
      'electron/**/*.test.ts',
      // The lint config's canary lives beside the config it pins.
      'eslint.config.test.ts',
    ],
    environment: 'node',
  },
})
