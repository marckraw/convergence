import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

/**
 * Elevation, by role. Black in both themes; on a dark surface the lighter
 * fill does most of the lifting.
 */
const ELEVATIONS = [
  [
    'shadow-control',
    '--elevation-control',
    'Buttons, inputs, a switch’s thumb',
  ],
  [
    'shadow-raised',
    '--elevation-raised',
    'Menus, popovers, the chosen chip (R8)',
  ],
  [
    'shadow-floating',
    '--elevation-floating',
    'The tooltip, the feedback button',
  ],
  ['shadow-overlay', '--elevation-overlay', 'Dialogs, the sidebar’s peek'],
  ['shadow-sheet', '--elevation-sheet', 'Loom’s stacked sheets'],
  ['shadow-sheet-open', '--elevation-sheet-open', 'Loom’s open sheet'],
  [
    'shadow-halo shadow-success-solid/16',
    '--shadow-halo',
    'A ring round a status dot, in its tone',
  ],
] as const

function Shadows() {
  return (
    <ul className="grid grid-cols-3 gap-8 bg-canvas p-8 text-ink">
      {ELEVATIONS.map(([utility, token, use]) => (
        <li key={utility} className="grid w-52 gap-3">
          <div
            aria-hidden
            data-elevation={token}
            className={`h-16 rounded-lg bg-surface ${utility}`}
          />
          <span className="font-mono text-xs">{utility}</span>
          <span className="text-xs text-ink-muted">
            {token}: {use}
          </span>
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: 'Foundations/Shadows',
  component: Shadows,
} satisfies Meta<typeof Shadows>

export default meta

type Story = StoryObj<typeof meta>

/** Every elevation, lowest first. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const drawn = ELEVATIONS.map(
      ([, token]) =>
        getComputedStyle(
          canvasElement.querySelector(`[data-elevation="${token}"]`)!,
        ).boxShadow,
    )
    for (const shadow of drawn) await expect(shadow).not.toBe('none')
    // Each role draws its own shadow.
    await expect(new Set(drawn).size).toBe(ELEVATIONS.length)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
