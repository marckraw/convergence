import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Input } from '../input/input'
import { ThemeScope } from './theme-scope'

const meta = {
  title: 'Components/ThemeScope',
  component: ThemeScope,
  args: { theme: 'dark' },
  render: (args) => (
    <div className="flex w-96 flex-col gap-3 rounded-lg bg-canvas p-3">
      <p className="text-sm">The app, in its own theme.</p>
      <ThemeScope {...args} className="rounded-lg bg-canvas p-3">
        <p className="text-sm">An island in a theme of its own.</p>
        <Input
          aria-label="Inside the island"
          defaultValue="zsh"
          className="mt-2"
        />
      </ThemeScope>
    </div>
  ),
} satisfies Meta<typeof ThemeScope>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A dark island in the light theme: inside it every token resolves as the
 * dark theme does, the text included, and the parts draw their dark look.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const scope = canvasElement.querySelector<HTMLElement>(
      '[data-slot="theme-scope"]',
    )
    if (!scope) throw new Error('no scope')
    await expect(scope).toHaveAttribute('data-theme', 'dark')
    await expect(getComputedStyle(scope).colorScheme).toBe('dark')
    await expect(tokenColor('--canvas', scope)).not.toBe(tokenColor('--canvas'))
    await expect(getComputedStyle(scope).backgroundColor).toBe(
      tokenColor('--canvas', scope),
    )
    await expect(
      getComputedStyle(canvas.getByText('An island in a theme of its own.'))
        .color,
    ).toBe(tokenColor('--ink', scope))
    await expect(
      getComputedStyle(canvas.getByLabelText('Inside the island'))
        .borderTopColor,
    ).toBe(tokenColor('--control-line', scope))
  },
}

/** Light: a light island in the dark theme, the other way round. */
export const Dark: Story = {
  args: { theme: 'light' },
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    const scope = canvasElement.querySelector<HTMLElement>(
      '[data-slot="theme-scope"]',
    )
    if (!scope) throw new Error('no scope')
    await expect(getComputedStyle(scope).colorScheme).toBe('light')
    await expect(tokenColor('--canvas', scope)).not.toBe(tokenColor('--canvas'))
  },
}
