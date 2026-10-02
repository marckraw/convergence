import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { Attachment } from './attachment.types'
import { AttachmentsRow } from './attachments-row.presentational'

const attachment = (
  id: string,
  filename: string,
  kind: Attachment['kind'],
  mimeType: string,
): Attachment => ({
  id,
  sessionId: 'session-1',
  kind,
  mimeType,
  filename,
  sizeBytes: 12_480,
  storagePath: `/Users/marcin/Library/Application Support/Convergence/attachments/${filename}`,
  thumbnailPath: null,
  textPreview: null,
  createdAt: '2026-09-30T09:12:00.000Z',
})

const attachments: Attachment[] = [
  attachment('a-1', 'sidebar-overflow.png', 'image', 'image/png'),
  attachment('a-2', 'quarterly-report.pdf', 'pdf', 'application/pdf'),
  attachment('a-3', 'notes.md', 'text', 'text/markdown'),
]

const meta = {
  title: 'Entities/Attachment/Attachments row',
  component: AttachmentsRow,
  args: {
    attachments,
    errorByAttachmentId: {},
    onOpen: fn(),
    onRemove: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-112 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AttachmentsRow>

export default meta

type Story = StoryObj<typeof meta>

/** The composer's attachments, one chip each, every one removable. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getAllByRole('button', { name: /^Preview/ }),
    ).toHaveLength(3)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove quarterly-report.pdf' }),
    )
    await expect(args.onRemove).toHaveBeenCalledWith('a-2')
    await userEvent.click(
      canvas.getByRole('button', { name: /^Preview notes\.md/ }),
    )
    await expect(args.onOpen).toHaveBeenCalledWith(attachments[2])
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** One attachment the chosen model cannot read: only its chip says so. */
export const Failed: Story = {
  args: {
    errorByAttachmentId: {
      'a-2': 'This model does not accept PDF attachments.',
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /^Preview quarterly-report\.pdf/ }),
    ).toHaveAccessibleDescription('This model does not accept PDF attachments.')
    await expect(
      canvas.getByRole('button', { name: /^Preview notes\.md/ }),
    ).toHaveAccessibleDescription('notes.md')
  },
}

/** Many attachments wrap onto more lines inside the composer's width. */
export const Long: Story = {
  args: {
    attachments: Array.from({ length: 12 }, (_, index) =>
      attachment(
        `a-${index}`,
        `design-review-screenshot-${index + 1}-with-a-long-name.png`,
        'image',
        'image/png',
      ),
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    const removes = canvas.getAllByRole('button', { name: /^Remove/ })
    await expect(removes).toHaveLength(12)
    // Wrapped, not overflowing: the last chip sits below the first, inside.
    const box = canvasElement.getBoundingClientRect()
    const last = removes[11].getBoundingClientRect()
    await expect(last.top).toBeGreaterThan(
      removes[0].getBoundingClientRect().top,
    )
    await expect(last.right).toBeLessThanOrEqual(box.right)
  },
}

/** No attachments draw nothing, not an empty row. */
export const Empty: Story = {
  args: { attachments: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}
