import { defineConfig } from 'vitest/config'

/**
 * Studio's node-environment pure tests. Rendered interaction checks live in
 * vitest.unit.config.ts; this tier retains the workspace-boundary canaries.
 *
 * `workspace-manifest.test.ts` is listed by name because it sits beside the
 * manifest it pins rather than under `src` — the same shape Convergence uses
 * for the lint config's canary (MAR-2737).
 */
export default defineConfig({
  test: {
    include: [
      'src/**/*.pure.test.ts',
      'workspace-manifest.test.ts',
      'workspace-import-ownership.test.ts',
    ],
    environment: 'node',
  },
})
