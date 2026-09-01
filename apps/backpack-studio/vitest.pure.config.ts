import { defineConfig } from 'vitest/config'

/**
 * Studio's only test tier: node-environment pure tests. It has no jsdom tier
 * yet because it has no stateful component to render — the root's `test:unit`
 * skips it through `--if-present` rather than reporting a zero.
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
