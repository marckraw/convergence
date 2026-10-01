/// <reference types="vite/client" />
import type { Preview } from '@storybook/react-vite'
import { finishScriptedAnimations, untilIdle } from './motion-testing'
import './preview.css'

/**
 * How every story is shown (MAR-3611): the app's stylesheet, three toolbars
 * that set on `<html>` exactly what the app sets there, and an accessibility
 * check that fails the story's test.
 */
const preview: Preview = {
  globalTypes: {
    theme: {
      description:
        'Color theme, as the .dark class on <html> (shared/lib/theme.ts)',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
    motion: {
      description:
        'Reduced motion, as data-motion="reduced" on <html>. The system setting applies either way.',
      toolbar: {
        title: 'Motion',
        icon: 'lightning',
        items: [
          {
            value: 'system',
            title: 'Motion as the system says',
            icon: 'lightning',
          },
          { value: 'reduced', title: 'Reduced motion', icon: 'lightningoff' },
        ],
        dynamicTitle: true,
      },
    },
    transparency: {
      description:
        'macOS window translucency, as data-platform and data-reduced-transparency on <html> (App.container.tsx)',
      toolbar: {
        title: 'Transparency',
        icon: 'contrast',
        items: [
          { value: 'vibrant', title: 'Vibrant (macOS)' },
          { value: 'reduced', title: 'Reduced transparency' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
    motion: 'system',
    transparency: 'vibrant',
  },
  decorators: [
    (Story, { globals }) => {
      // The tokens resolve from these attributes, exactly as they do in the
      // app: applyTheme() toggles .dark, and App.container.tsx writes the
      // platform and the reduced-transparency preference.
      const root = document.documentElement
      root.classList.toggle('dark', globals.theme === 'dark')
      if (globals.motion === 'reduced') root.dataset.motion = 'reduced'
      else delete root.dataset.motion
      root.dataset.platform = 'darwin'
      root.dataset.reducedTransparency = String(
        globals.transparency === 'reduced',
      )
      return <Story />
    },
  ],
  // Runs after each play function and before the accessibility check
  // (Storybook runs the project's afterEach ahead of the addons'), so the
  // check sees the page at rest: no surface halfway through its pop.
  afterEach: async () => {
    await finishScriptedAnimations()
    await untilIdle()
  },
  parameters: {
    // The sidebar's groups: the design system from the ground up, then the
    // app from the ground up. Storybook reads this without running the file,
    // so the list stays written out here.
    options: {
      storySort: {
        order: [
          'Foundations',
          'Primitives',
          'Components',
          'Motion',
          'Entities',
          'Features',
          'Widgets',
        ],
      },
    },
    layout: 'centered',
    // Accessibility violations fail the story's test, contrast included.
    a11y: { test: 'error' },
  },
}

export default preview
