import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const packageDir = dirname(fileURLToPath(import.meta.url))

/**
 * The design system's tests, in two projects.
 *
 * - `unit`: the component tests in jsdom, with the same shims the app's unit
 *   config uses (`src/test-setup.ts`).
 * - `storybook` (MAR-3611): every story is a test, rendered in headless
 *   Chromium with the Storybook config in `.storybook/`, play function and
 *   all, then checked by axe (`a11y.test: 'error'` in preview.tsx), so an
 *   accessibility violation fails it.
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
      {
        extends: true,
        plugins: [storybookTest({ configDir: join(packageDir, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
