import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { MissingAttachmentChip } from './missing-attachment-chip.presentational'

const meta = {
  title: 'Entities/Attachment/Missing attachment chip',
  component: MissingAttachmentChip,
  args: {
    attachmentId: 'attachment-gone',
    filename: 'sidebar-overflow.png',
  },
} satisfies Meta<typeof MissingAttachmentChip>

export default meta

type Story = StoryObj<typeof meta>

/** A sent attachment whose file is gone: its name, and nothing to open. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('sidebar-overflow.png')).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Without a remembered name it still says an attachment was here. */
export const Empty: Story = {
  args: { filename: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Unavailable attachment')).toBeVisible()
  },
}

/** A long name is cut short at the end of the chip. */
export const Long: Story = {
  args: {
    filename:
      'Screenshot 2026-09-30 at 09.12.44 — the sidebar overflowing on a small window.png',
  },
  play: async ({ canvas }) => {
    const name = canvas.getByText(/^Screenshot 2026-09-30/)
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
  },
}
