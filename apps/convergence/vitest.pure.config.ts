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
      '../../eslint.config.test.ts',
      // And the manifest's canary beside the manifest it pins (MAR-2737).
      'workspace-manifest.test.ts',
      // And the workspace-ownership organ, which reads the trees around it.
      'workspace-import-ownership.test.ts',
      // Its parser, pinned form by form — a root file like the organ itself.
      '../../workspace-import-ownership.syntax.test.ts',
    ],
    environment: 'node',
  },
})
