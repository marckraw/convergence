import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen } from 'storybook/test'
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

/**
 * A sent attachment whose file is gone: its name on a dashed chip, and
 * nothing to open. Resting the pointer on it says why, in our tooltip.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText('sidebar-overflow.png')).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
    const chip = canvasElement.querySelector('[data-slot="chip"]')!
    await expect(chip).toHaveAttribute('data-missing')
    await expect(chip).not.toHaveAttribute('title')
    await expect(chip).toHaveTextContent(
      'Attachment file is no longer available',
    )
    await userEvent.hover(chip)
    await expect(
      await screen.findByRole('tooltip', {}, { timeout: 2000 }),
    ).toHaveTextContent('Attachment file is no longer available')
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
    // The chip cuts its name short (the name's own line is inline in it).
    const cut = canvas.getByText(/^Screenshot 2026-09-30/).parentElement!
    await expect(cut.scrollWidth).toBeGreaterThan(cut.clientWidth)
  },
}
