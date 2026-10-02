import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { Attachment } from './attachment.types'
import { AttachmentPreview } from './attachment-preview.presentational'

const screenshot: Attachment = {
  id: 'attachment-screenshot',
  sessionId: 'session-1',
  kind: 'image',
  mimeType: 'image/svg+xml',
  filename: 'sidebar-overflow.svg',
  sizeBytes: 412,
  storagePath:
    '/Users/marcin/Library/Application Support/Convergence/attachments/sidebar-overflow.svg',
  thumbnailPath: null,
  textPreview: null,
  createdAt: '2026-09-30T09:12:00.000Z',
}

const notes: Attachment = {
  ...screenshot,
  id: 'attachment-notes',
  kind: 'text',
  mimeType: 'text/markdown',
  filename: 'notes.md',
}

/** What the preview reads into an object URL, inlined so the story has no file. */
const pictureUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#1e293b"/><rect x="24" y="24" width="160" height="352" rx="12" fill="#334155"/><rect x="208" y="24" width="408" height="352" rx="12" fill="#0f172a"/></svg>',
)}`

const meta = {
  title: 'Entities/Attachment/Attachment preview',
  component: AttachmentPreview,
  args: {
    attachment: screenshot,
    objectUrl: pictureUrl,
    textContent: null,
    isLoading: false,
    error: null,
    onClose: fn(),
  },
} satisfies Meta<typeof AttachmentPreview>

export default meta

type Story = StoryObj<typeof meta>

/** An image, whole, in a dialog named for its file; Escape closes it. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'sidebar-overflow.svg',
    })
    await waitFor(() =>
      expect(
        within(dialog).getByRole('img', { name: 'sidebar-overflow.svg' }),
      ).toBeVisible(),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(args.onClose).toHaveBeenCalledOnce())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A text file reads as its own text. */
export const Text: Story = {
  args: {
    attachment: notes,
    objectUrl: null,
    textContent:
      '# Sidebar\n\n- the project list overflows below 900 px\n- the search field loses focus on Escape',
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'notes.md' })
    await waitFor(() =>
      expect(
        within(dialog).getByText(/the project list overflows below 900 px/),
      ).toBeVisible(),
    )
  },
}

/** While the file is read, the dialog says so and shows nothing else. */
export const Busy: Story = {
  args: { isLoading: true, objectUrl: null },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'sidebar-overflow.svg',
    })
    await waitFor(() =>
      expect(within(dialog).getByText('Loading…')).toBeVisible(),
    )
    await expect(within(dialog).queryByRole('img')).toBeNull()
  },
}

/** A file that cannot be read says why, in place of the picture. */
export const Failed: Story = {
  args: {
    objectUrl: null,
    error: 'The attachment file could not be read.',
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'sidebar-overflow.svg',
    })
    await waitFor(() =>
      expect(
        within(dialog).getByText('The attachment file could not be read.'),
      ).toBeVisible(),
    )
  },
}

/** A picture taller than the window: whole and uncropped, within the window. */
export const Tall: Story = {
  args: {
    objectUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="2400"><rect width="400" height="2400" fill="#334155"/></svg>',
    )}`,
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'sidebar-overflow.svg',
    })
    const image = (await within(dialog).findByRole('img', {
      name: 'sidebar-overflow.svg',
    })) as HTMLImageElement
    await waitFor(() => expect(image.naturalHeight).toBe(2400))
    await expect(getComputedStyle(image).objectFit).toBe('contain')
    await waitFor(() =>
      expect(image.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        window.innerHeight,
      ),
    )
  },
}

/** No attachment, no dialog. */
export const Empty: Story = {
  args: { attachment: null, objectUrl: null },
  play: async () => {
    await expect(screen.queryByRole('dialog')).toBeNull()
  },
}
