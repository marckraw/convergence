import { defineConfig } from 'vitest/config'

/**
 * Studio's pure tier: deterministic logic with no IO, in a node environment.
 *
 * It spans both trees — the renderer's readings of a snapshot and the backend's
 * wire, config and fold modules are the same kind of thing, and splitting them
 * by directory would only hide half of them from a reader looking for "what is
 * proven without a daemon".
 *
 * `workspace-manifest.test.ts` and `workspace-import-ownership.test.ts` are
 * listed by name because they sit beside what they pin rather than under a
 * source tree — the same shape Convergence uses for the lint config's canary
 * (MAR-2737).
 */
export default defineConfig({
  test: {
    include: [
      'src/**/*.pure.test.ts',
      'electron/**/*.pure.test.ts',
      'workspace-manifest.test.ts',
      'workspace-import-ownership.test.ts',
    ],
    environment: 'node',
  },
})
