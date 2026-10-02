import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ProjectContextItem } from '@/entities/project-context'
import { expect, fn } from 'storybook/test'
import { ComposerContextMentionPicker } from './composer-context-mention.presentational'

const items: ProjectContextItem[] = [
  {
    id: 'ctx-arch',
    projectId: 'project-convergence',
    label: 'Architecture rules',
    body: 'FSD-lite: app, widgets, features, entities, shared. One-way imports, cross-slice through index.ts only.',
    reinjectMode: 'boot',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 'ctx-gates',
    projectId: 'project-convergence',
    label: 'Gates before a PR',
    body: 'npm run typecheck, test:pure, test:unit, test:stories and chaperone check, one per command, in the foreground.',
    reinjectMode: 'every-turn',
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:00.000Z',
  },
  {
    id: 'ctx-untitled',
    projectId: 'project-convergence',
    label: null,
    body: 'Never run npm run dev; ask Marcin to.',
    reinjectMode: 'boot',
    createdAt: '2026-09-03T09:00:00.000Z',
    updatedAt: '2026-09-03T09:00:00.000Z',
  },
]

const meta = {
  title: 'Features/Composer/ComposerContextMention',
  component: ComposerContextMentionPicker,
  args: {
    open: true,
    listId: 'context',
    items,
    highlightedIndex: 1,
    onSelect: fn(),
    onHover: fn(),
    onDismiss: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="relative mt-64 w-144 max-w-full rounded-md border border-line bg-surface p-3 text-sm text-ink-muted">
        <Story />
        @gat
      </div>
    ),
  ],
} satisfies Meta<typeof ComposerContextMentionPicker>

export default meta

type Story = StoryObj<typeof meta>

/** @ offers the project's context notes; every-turn notes are marked. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    // A named list that holds only its options (MAR-3616 DS3e).
    await expect(canvas.getByRole('listbox')).toHaveAccessibleName(
      'Project context',
    )
    const gates = canvas.getByRole('option', { name: /Gates before a PR/ })
    await expect(gates).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByRole('option', { name: /Untitled/ })).toBeVisible()
    await userEvent.hover(canvas.getByRole('option', { name: /Architecture/ }))
    await expect(args.onHover).toHaveBeenCalledWith(0)
    await userEvent.click(gates)
    await expect(args.onSelect).toHaveBeenCalledWith(items[1])
  },
}

/** Nothing matches. */
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('No matching project context items'),
    ).toBeVisible()
  },
}

/** A long note is cut to a short preview. */
export const Long: Story = {
  args: {
    items: [
      {
        ...items[0],
        body: 'FSD-lite: app, widgets, features, entities, shared. One-way imports from higher layers to lower ones, cross-slice imports through each slice’s index.ts only, and presentational files never own effects.',
      },
    ],
    highlightedIndex: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('option')).toHaveTextContent(/…$/)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
