import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { Attachment } from './attachment.types'
import { AttachmentChip } from './attachment-chip.presentational'

const screenshot: Attachment = {
  id: 'attachment-screenshot',
  sessionId: 'session-1',
  kind: 'image',
  mimeType: 'image/png',
  filename: 'sidebar-overflow.png',
  sizeBytes: 248_133,
  storagePath:
    '/Users/marcin/Library/Application Support/Convergence/attachments/sidebar-overflow.png',
  thumbnailPath: null,
  textPreview: null,
  createdAt: '2026-09-30T09:12:00.000Z',
}

const meta = {
  title: 'Entities/Attachment/Attachment chip',
  component: AttachmentChip,
  args: {
    attachment: screenshot,
    capabilityError: null,
    onOpen: fn(),
    onRemove: fn(),
  },
} satisfies Meta<typeof AttachmentChip>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A chip in the composer: its name opens the preview, and the cross beside it
 * removes the attachment without opening it.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const preview = canvas.getByRole('button', {
      name: 'Preview sidebar-overflow.png. Press to open preview or Delete to remove.',
    })
    await expect(preview).toHaveTextContent('sidebar-overflow.png')
    await userEvent.click(preview)
    await expect(args.onOpen).toHaveBeenCalledWith(screenshot)

    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove sidebar-overflow.png' }),
    )
    await expect(args.onRemove).toHaveBeenCalledWith('attachment-screenshot')
    await expect(args.onOpen).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** In a sent message the chip only opens: there is nothing to remove. */
export const ReadOnly: Story = {
  args: {
    attachment: {
      ...screenshot,
      id: 'attachment-notes',
      kind: 'text',
      mimeType: 'text/markdown',
      filename: 'notes.md',
    },
    onRemove: undefined,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /^Preview notes\.md/ }),
    ).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /^Remove/ })).toBeNull()
  },
}

/** The model cannot read this file: the chip says why on its name. */
export const Failed: Story = {
  args: {
    attachment: {
      ...screenshot,
      id: 'attachment-pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      filename: 'quarterly-report.pdf',
    },
    capabilityError: 'This model does not accept PDF attachments.',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /^Preview quarterly-report\.pdf/ }),
    ).toHaveAccessibleDescription('This model does not accept PDF attachments.')
  },
}

/** A long name is cut in the middle on the chip; its full name stays its name. */
export const Long: Story = {
  args: {
    attachment: {
      ...screenshot,
      filename:
        'Screenshot 2026-09-30 at 09.12.44 — the sidebar overflowing on a small window.png',
    },
  },
  play: async ({ canvas }) => {
    const preview = canvas.getByRole('button', {
      name: /^Preview Screenshot 2026-09-30 at 09\.12\.44 — the sidebar overflowing on a small window\.png/,
    })
    await expect(preview).toHaveTextContent('…')
    await expect(preview).not.toHaveTextContent('the sidebar overflowing')
  },
}
