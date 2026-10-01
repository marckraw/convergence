import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { mergeConfig, type PluginOption } from 'vite'

/**
 * One Storybook for the design system and, later, the app (MAR-3611).
 *
 * The app's stories will import across slices with `@/`, as the app does, so
 * the alias points at `apps/convergence/src` here too. Tailwind runs as it
 * does in the app's own build, from the app's real stylesheet (preview.css).
 * The same config drives the story tests: `storybookTest` in vitest.config.ts
 * applies this `viteFinal`.
 */
const appSource = fileURLToPath(
  new URL('../../../apps/convergence/src', import.meta.url),
)

/**
 * Whether a plugin with one of these names is already in the list, so a
 * framework that ever starts adding React or Tailwind itself does not get a
 * second copy. The names are exact: Storybook's own docgen plugin is called
 * `vite:react-docgen-typescript`, so a prefix would mistake it for React.
 */
const hasPlugin = (plugins: PluginOption[], names: string[]): boolean =>
  plugins
    .flat(Infinity as 1)
    .some(
      (plugin) =>
        typeof plugin === 'object' &&
        plugin !== null &&
        'name' in plugin &&
        typeof plugin.name === 'string' &&
        names.includes(plugin.name),
    )

const REACT_PLUGINS = [
  'vite:react-babel',
  'vite:react-swc',
  'vite:react-refresh',
]
const TAILWIND_PLUGINS = [
  '@tailwindcss/vite:scan',
  '@tailwindcss/vite:generate:serve',
  '@tailwindcss/vite:generate:build',
]

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.tsx',
    '../../../apps/convergence/src/**/*.stories.tsx',
  ],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  core: {
    disableTelemetry: true,
  },
  viteFinal: (viteConfig) => {
    const plugins = viteConfig.plugins ?? []
    return mergeConfig(viteConfig, {
      plugins: [
        ...(hasPlugin(plugins, REACT_PLUGINS) ? [] : [react()]),
        ...(hasPlugin(plugins, TAILWIND_PLUGINS) ? [] : [tailwindcss()]),
      ],
      resolve: {
        alias: { '@': appSource },
      },
      // As in the app's own build (electron.vite.config.ts): the diff viewer
      // starts a Web Worker, and Vite's default IIFE worker cannot be split
      // into chunks, so `build-storybook` fails without it.
      worker: {
        format: 'es',
      },
      optimizeDeps: {
        // Prebundled up front: a dependency Vite only discovers while a story
        // runs makes it reload the page mid-test, which fails every story in
        // that file on a cold cache (as in CI).
        include: [
          '@base-ui/react/button',
          '@base-ui/react/tooltip',
          '@radix-ui/react-dialog',
          '@radix-ui/react-dropdown-menu',
          '@radix-ui/react-popover',
          '@radix-ui/react-slot',
          '@radix-ui/react-tooltip',
          'class-variance-authority',
          'clsx',
          'cmdk',
          'lucide-react',
          'radix-ui',
          'tailwind-merge',
          // The app's own heavy dependencies, which its stories reach through
          // the components they render (MAR-3617): the markdown renderer and
          // its plugins, the canvases, motion, charts and the stores.
          '@streamdown/code',
          '@streamdown/mermaid',
          '@xyflow/react',
          'chartgpu-react',
          'motion/react',
          'streamdown',
          'zustand',
        ],
      },
    })
  },
}

export default config
