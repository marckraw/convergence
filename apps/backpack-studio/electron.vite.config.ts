import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html'),
        },
      },
    },
    plugins: [react()],
  },
})
