import { defineConfig } from 'vitest/config'

/**
 * Studio's unit tier: everything that composes real parts (MAR-2770).
 *
 * The store against a real temporary directory, and the conversation service
 * against the client, the store and the package's stub daemon speaking the real
 * wire protocol. Nothing here is pure, and calling it pure would have hidden
 * the only tests that prove the seam the run's promise is made of.
 *
 * `.pure.test.ts` is excluded rather than merely unlisted, so a pure test can
 * never be counted twice across the two tiers.
 */
export default defineConfig({
  test: {
    include: ['electron/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.pure.test.ts'],
    environment: 'node',
  },
})
