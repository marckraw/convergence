import { dirname, resolve } from 'path'
import { createRequire } from 'node:module'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
// Backpack ships fonts without subpath exports; resolve them beside its public Button entry.
const backpackFonts = resolve(
  dirname(require.resolve('@ef-global/backpack/Button')),
  '../../assets/fonts',
)

/**
 * The workspace packages this build compiles from source rather than requiring
 * at runtime — the same list, and the same reason, as Convergence's config
 * (MAR-2737). `@convergence/execution-host-client` publishes TypeScript through
 * its `exports`, so externalizing it would emit a `require` the packaged app
 * cannot resolve.
 */
const BUNDLED_WORKSPACE_PACKAGES = ['@convergence/execution-host-client']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: BUNDLED_WORKSPACE_PACKAGES })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: BUNDLED_WORKSPACE_PACKAGES })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src',
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@backpack-fonts': backpackFonts,
        // Tailwind 4.2 resolves CSS with the style condition; Backpack exports import/require only.
        '@ef-global/backpack/css/global.css':
          require.resolve('@ef-global/backpack/css/global.css'),
        '@ef-global/backpack/css/button.css':
          require.resolve('@ef-global/backpack/css/button.css'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html'),
        },
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
