import { defineConfig } from 'vitest/config'

/**
 * Every test in this package is a node-environment test, so there is one config
 * and it is the pure tier. The package has no renderer and no jsdom tier; the
 * root's `test:unit` skips it through `--if-present` rather than by running an
 * empty suite that would report a zero nobody can tell from a missing run.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'workspace-import-ownership.test.ts'],
    environment: 'node',
  },
})
