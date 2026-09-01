import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The workspace packages this build compiles from source rather than requiring
 * at runtime (MAR-2737).
 *
 * `@convergence/execution-host-client` publishes TypeScript through its
 * `exports`, so it can only ever be *bundled*: externalizing it would emit a
 * bare `require('@convergence/execution-host-client')` into `out/main`, and the
 * packaged app would resolve that to a `.ts` entry point Electron cannot load —
 * at runtime, on a user's machine, long after every gate went green. It is a
 * devDependency for the same reason, and this list is the pin that keeps the
 * answer right even if someone later moves it into `dependencies`.
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
    plugins: [externalizeDepsPlugin()],
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
    worker: {
      format: 'es',
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html'),
        },
      },
    },
    plugins: [
      tanstackRouter({
        target: 'react',
        routesDirectory: './app/routes',
        generatedRouteTree: './app/routeTree.gen.ts',
        quoteStyle: 'single',
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  },
})
