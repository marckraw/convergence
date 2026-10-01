import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

/**
 * The corners, by what wears them. The class names stay Tailwind's; bare
 * `rounded` is 10 px here, not Tailwind's 4.
 */
const CORNERS = [
  ['rounded-sm', '--corner-xs', 4, 'Menu and select items, small chips'],
  ['rounded-md', '--corner-control', 6, 'Controls, menus, popovers'],
  ['rounded-lg', '--corner-card', 8, 'Cards, notices'],
  ['rounded', '--corner-row', 10, 'Sidebar rows, small cards'],
  ['rounded-xl', '--corner-panel', 12, 'Dialogs, tooltips, the terminal frame'],
  ['rounded-2xl', '--corner-sheet', 16, 'The actions panel, settings cards'],
] as const

function Radii() {
  return (
    <ul className="grid grid-cols-3 gap-6 bg-canvas p-6 text-ink">
      {CORNERS.map(([utility, token, px, use]) => (
        <li key={utility} className="grid w-48 gap-2">
          <div
            aria-hidden
            data-corner={px}
            className={`h-20 border border-line bg-surface-muted ${utility}`}
          />
          <span className="font-mono text-xs">
            {utility} · {px} px
          </span>
          <span className="text-xs text-ink-muted">
            {token}: {use}
          </span>
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: 'Foundations/Radii',
  component: Radii,
} satisfies Meta<typeof Radii>

export default meta

type Story = StoryObj<typeof meta>

/** Every corner, smallest first. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    for (const [, , px] of CORNERS) {
      const box = canvasElement.querySelector(`[data-corner="${px}"]`)!
      await expect(getComputedStyle(box).borderTopLeftRadius).toBe(`${px}px`)
    }
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
