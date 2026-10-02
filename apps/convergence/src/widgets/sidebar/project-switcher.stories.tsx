import type { Meta, StoryObj } from '@storybook/react-vite'
import { DEFAULT_PROJECT_SETTINGS, type Project } from '@/entities/project'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { ProjectSwitcher } from './project-switcher.presentational'

const project = (
  id: string,
  name: string,
  repositoryPath: string,
  lane: { of: string; name: string } | null = null,
): Project => ({
  id,
  name,
  repositoryPath,
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-09-30T08:00:00.000Z',
  laneOf: lane?.of ?? null,
  laneName: lane?.name ?? null,
})

const projects: Project[] = [
  project('convergence', 'convergence', '~/Projects/Private/convergence'),
  project(
    'convergence-studio',
    'convergence · lane: studio',
    '~/Projects/Private/lanes/studio',
    { of: 'convergence', name: 'studio' },
  ),
  project('emergence', 'emergence', '~/Projects/Private/emergence'),
  project('codewalk', 'codewalk', '~/Projects/OpenSource/codewalk'),
]

const meta = {
  title: 'Widgets/Sidebar/Project switcher',
  component: ProjectSwitcher,
  args: {
    projects,
    activeProjectId: 'convergence',
    onSelectProject: fn(),
    onCreateProject: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-72 bg-canvas pt-3 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectSwitcher>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The sidebar's project: every project, a lane under its root with a badge,
 * and a way to open another one.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'convergence' }))
    const options = await screen.findAllByRole('option')
    await expect(options).toHaveLength(4)
    // The lane follows its root and is listed by its own name.
    const lane = options[1]
    await expect(lane).toHaveTextContent('studio')
    await expect(within(lane).getByText('lane')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('option', { name: /emergence/ }))
    await expect(args.onSelectProject).toHaveBeenCalledWith('emergence')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Opening a project is the list's last action, under every project. */
export const OpenProject: Story = {
  name: 'Open a project',
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'convergence' }))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open a project' }),
    )
    await expect(args.onCreateProject).toHaveBeenCalledOnce()
  },
}

/** No project yet: the switcher asks for one. */
export const Empty: Story = {
  args: { projects: [], activeProjectId: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Select project' }),
    ).toBeVisible()
  },
}

/** Many projects with long paths scroll inside the list. */
export const Long: Story = {
  args: {
    projects: Array.from({ length: 24 }, (_, index) =>
      project(
        `client-${index}`,
        `client-project-with-a-rather-long-name-${index + 1}`,
        `~/Projects/Clients/Somewhere/Deep/In/The/Tree/client-${index + 1}`,
      ),
    ),
    activeProjectId: 'client-0',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox'))
    const listbox = await screen.findByRole('listbox')
    await expect(listbox.scrollHeight).toBeGreaterThan(listbox.clientHeight)
    await expect(listbox.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    )
  },
}
