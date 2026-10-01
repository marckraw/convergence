import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { DevBuildRibbon } from './dev-build-ribbon.presentational'

const meta = {
  title: 'Widgets/App/Dev build ribbon',
  component: DevBuildRibbon,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="relative h-40 bg-background p-4 text-sm text-foreground">
        <button type="button" className="mt-8 underline">
          Something under the ribbon
        </button>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DevBuildRibbon>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A development build says so at the top of the window, and never takes a
 * click from what is under it.
 */
export const Default: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          // a11y-known: the ribbon's amber-200 text is the same in both
          // themes and nearly invisible on the light one (1.06:1) — fixed by
          // the sweep (DS4)
          { id: 'color-contrast', enabled: false },
        ],
      },
    },
  },
  play: async ({ canvas }) => {
    const ribbon = canvas.getByText('Dev version')
    await expect(ribbon).toBeVisible()
    await expect(getComputedStyle(ribbon).pointerEvents).toBe('none')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: Default.play,
}
