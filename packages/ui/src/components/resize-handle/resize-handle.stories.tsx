import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { ResizeHandle } from './resize-handle'

const DEFAULT_WIDTH = 160

/** A sidebar and the conversation, with the handle between them. */
function Panes() {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  return (
    <div className="flex h-48 w-120 rounded-md border border-line bg-canvas text-xs text-ink">
      <div
        className="shrink-0 border-r border-line p-3"
        style={{ width }}
        data-testid="sidebar"
      >
        Sidebar, {width} px
      </div>
      <ResizeHandle
        value={width}
        min={120}
        max={240}
        onChange={setWidth}
        onReset={() => setWidth(DEFAULT_WIDTH)}
        label="Resize the sidebar"
      />
      <div className="min-w-0 flex-1 p-3">Conversation</div>
    </div>
  )
}

const meta = {
  title: 'Components/ResizeHandle',
  component: Panes,
} satisfies Meta<typeof Panes>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A focusable separator with its value, min and max: the arrow keys move it
 * 16 px, Home and End to its ends, a double-click resets it, and the keyboard
 * sees it in the focus colour.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const handle = canvas.getByRole('separator', {
      name: 'Resize the sidebar',
    })
    await expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    await expect(handle).toHaveAttribute('aria-valuenow', '160')
    await expect(handle).toHaveAttribute('aria-valuemin', '120')
    await expect(handle).toHaveAttribute('aria-valuemax', '240')
    await userEvent.tab()
    await expect(handle).toHaveFocus()
    const focus = tokenColor('--focus')
    await waitFor(() =>
      expect(getComputedStyle(handle).backgroundColor).toBe(focus),
    )
    await userEvent.keyboard('{ArrowRight}')
    await expect(handle).toHaveAttribute('aria-valuenow', '176')
    await expect(
      canvas.getByTestId('sidebar').getBoundingClientRect().width,
    ).toBe(176)
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    await expect(handle).toHaveAttribute('aria-valuenow', '144')
    await userEvent.keyboard('{End}')
    await expect(handle).toHaveAttribute('aria-valuenow', '240')
    await userEvent.keyboard('{ArrowRight}')
    await expect(handle).toHaveAttribute('aria-valuenow', '240')
    await userEvent.keyboard('{Home}')
    await expect(handle).toHaveAttribute('aria-valuenow', '120')
    await userEvent.dblClick(handle)
    await expect(handle).toHaveAttribute('aria-valuenow', '160')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent }) => {
    const handle = canvas.getByRole('separator', {
      name: 'Resize the sidebar',
    })
    const focus = tokenColor('--focus')
    await userEvent.tab()
    await expect(handle).toHaveFocus()
    await waitFor(() =>
      expect(getComputedStyle(handle).backgroundColor).toBe(focus),
    )
  },
}
