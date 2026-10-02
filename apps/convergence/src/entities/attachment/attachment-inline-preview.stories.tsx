import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { Attachment } from './attachment.types'
import { AttachmentInlinePreview } from './attachment-inline-preview.presentational'

const screenshot: Attachment = {
  id: 'attachment-screenshot',
  sessionId: 'session-1',
  kind: 'image',
  mimeType: 'image/png',
  filename: 'sidebar-overflow.png',
  sizeBytes: 248_133,
  storagePath:
    '/Users/marcin/Library/Application Support/Convergence/attachments/sidebar-overflow.png',
  thumbnailPath:
    '/Users/marcin/Library/Application Support/Convergence/attachments/sidebar-overflow.thumb.png',
  textPreview: null,
  createdAt: '2026-09-30T09:12:00.000Z',
}

const meta = {
  title: 'Entities/Attachment/Attachment inline preview',
  component: AttachmentInlinePreview,
  args: {
    attachment: screenshot,
    onOpen: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AttachmentInlinePreview>

export default meta

type Story = StoryObj<typeof meta>

/** An image in a sent message: the picture and its name, opening the preview. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const preview = canvas.getByRole('button', {
      name: 'Preview sidebar-overflow.png',
    })
    // The picture is decoration inside the button: the button's name and the
    // line under it say the file, so a screen reader hears it once.
    await expect(preview.querySelector('img')).toHaveAttribute('alt', '')
    await expect(preview).toHaveTextContent('sidebar-overflow.png')
    await userEvent.click(preview)
    await expect(args.onOpen).toHaveBeenCalledWith(screenshot)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Only images preview inline; a PDF draws nothing here. */
export const Empty: Story = {
  args: {
    attachment: {
      ...screenshot,
      kind: 'pdf',
      mimeType: 'application/pdf',
      filename: 'quarterly-report.pdf',
      thumbnailPath: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** A long name is cut short under the picture. */
export const Long: Story = {
  args: {
    attachment: {
      ...screenshot,
      filename:
        'Screenshot 2026-09-30 at 09.12.44 — the sidebar overflowing on a small window.png',
    },
  },
  play: async ({ canvas }) => {
    const name = canvas.getByText(/^Screenshot 2026-09-30/)
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
  },
}
