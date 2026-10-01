import { defineConfig } from 'vitest/config'

/**
 * The design system's tests. `unit` is the component tests in jsdom, with the
 * same shims the app's unit config uses (`src/test-setup.ts`).
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
})
