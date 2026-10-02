import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

/**
 * One height scale for every control (R3). A part's `size` prop picks the
 * step; the app never writes these classes itself. `xl` is the Button's own
 * step, for a title you press (ruling 9); fields stop at `lg`.
 */
const STEPS = [
  ['xs', 'h-control-xs', 24, 'Icon buttons in rows'],
  ['sm', 'h-control-sm', 28, 'Icon buttons in headers, compact fields'],
  ['md', 'h-control-md', 32, 'The default control'],
  ['lg', 'h-control-lg', 36, 'Prominent actions and fields'],
  ['xl', 'h-control-xl', 44, 'A title you press: the Button’s alone'],
] as const

function ControlHeights() {
  return (
    <ul className="flex items-end gap-6 bg-canvas p-6 text-ink">
      {STEPS.map(([step, utility, px, use]) => (
        <li key={step} className="grid w-40 gap-2">
          <div
            aria-hidden
            data-control={step}
            className={`rounded-md border border-control-line bg-surface ${utility}`}
          />
          <span className="font-mono text-xs">
            --control-{step} · {px} px
          </span>
          <span className="text-xs text-ink-muted">{use}</span>
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: 'Foundations/Control heights',
  component: ControlHeights,
} satisfies Meta<typeof ControlHeights>

export default meta

type Story = StoryObj<typeof meta>

/** Every step, smallest first. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    for (const [step, , px] of STEPS) {
      const box = canvasElement.querySelector(`[data-control="${step}"]`)!
      await expect(box.getBoundingClientRect().height).toBe(px)
    }
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
