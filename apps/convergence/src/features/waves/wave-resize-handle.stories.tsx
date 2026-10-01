import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { WaveResizeHandle } from './wave-resize-handle.presentational'
import {
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
  WAVE_PANEL_MIN_COLUMN_WIDTH,
} from './wave-sections.pure'

/** Loom's column edge, as the panel draws it: a strip between the column and the room. */
const meta = {
  title: 'Features/Waves/WaveResizeHandle',
  component: WaveResizeHandle,
  args: {
    width: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
    min: WAVE_PANEL_MIN_COLUMN_WIDTH,
    max: WAVE_PANEL_MAX_COLUMN_WIDTH,
    onMouseDown: fn(),
    onKeyDown: fn(),
    onDoubleClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex h-64">
        <div className="w-40 bg-muted" />
        <Story />
        <div className="w-40" />
      </div>
    ),
  ],
} satisfies Meta<typeof WaveResizeHandle>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A separator with a value: the keyboard reaches it, the arrows move it, and a
 * double click puts the column back to its default width.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const handle = canvas.getByRole('separator', {
      name: 'Resize the wave column',
    })
    await expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    await expect(handle).toHaveAttribute('aria-valuemin', String(args.min))
    await expect(handle).toHaveAttribute('aria-valuemax', String(args.max))
    await expect(handle).toHaveAttribute('aria-valuenow', String(args.width))
    await userEvent.tab()
    await expect(handle).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(args.onKeyDown).toHaveBeenCalledOnce()
    await userEvent.dblClick(handle)
    await expect(args.onDoubleClick).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** At its widest the value says so. */
export const Long: Story = {
  args: { width: WAVE_PANEL_MAX_COLUMN_WIDTH },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole('separator')).toHaveAttribute(
      'aria-valuenow',
      String(args.max),
    )
  },
}
