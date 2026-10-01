import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import type { ProjectContextItem } from '@/entities/project-context'
import { ProjectContextList } from './project-context-list.presentational'

const item = (
  id: string,
  label: string | null,
  body: string,
  reinjectMode: ProjectContextItem['reinjectMode'] = 'boot',
): ProjectContextItem => ({
  id,
  projectId: 'project-convergence',
  label,
  body,
  reinjectMode,
  createdAt: '2026-09-28T09:00:00.000Z',
  updatedAt: '2026-09-30T14:30:00.000Z',
})

const items: ProjectContextItem[] = [
  item(
    'ctx-api',
    'monorepo-api',
    'The API lives in packages/api. Run its tests with npm test -w api, never from the root.',
  ),
  item(
    'ctx-style',
    'house style',
    'Small vertical slices. Honest states at every beat. No TODO markers: file a Linear issue instead.',
    'every-turn',
  ),
  item(
    'ctx-untitled',
    null,
    'Electron main-process code lives in electron/, renderer code in src/.',
  ),
]

const meta = {
  title: 'Features/ProjectContextSettings/ProjectContextList',
  component: ProjectContextList,
  args: {
    items,
    isLoading: false,
    isEmpty: false,
    onCreateClick: fn(),
    onEditClick: fn(),
    onDeleteRequest: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[520px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectContextList>

export default meta

type Story = StoryObj<typeof meta>

/** One row per item, each with its cadence, and Edit and Delete named for it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const rows = within(canvas.getByRole('list')).getAllByRole('listitem')
    await expect(rows).toHaveLength(3)
    await expect(
      within(rows[1] as HTMLElement).getByText('Every turn'),
    ).toBeVisible()
    await expect(
      within(rows[2] as HTMLElement).getByText('Untitled'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit monorepo-api' }),
    )
    await expect(args.onEditClick).toHaveBeenCalledWith(items[0])
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete house style…' }),
    )
    await expect(args.onDeleteRequest).toHaveBeenCalledWith(items[1])
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
    await expect(args.onCreateClick).toHaveBeenCalledOnce()
  },
}

/** Empty: a line that says how to make the first one. */
export const Empty: Story = {
  args: { items: [], isEmpty: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No context items yet/)).toBeVisible()
    await expect(canvas.queryByRole('list')).toBeNull()
  },
}

/** Busy: Add waits while the items load. */
export const Busy: Story = {
  args: { items: [], isLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Add' })).toBeDisabled()
  },
}

/** Long: a long body is cut to a preview with an ellipsis. */
export const Long: Story = {
  args: {
    items: [
      item(
        'ctx-long',
        'a label long enough that it has to be truncated inside the row',
        Array.from(
          { length: 6 },
          () =>
            'Every new part ships with stories, and every story is a test with an accessibility check.',
        ).join(' '),
      ),
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/…$/)).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  name: 'Dark',
  globals: { theme: 'dark' },
}
