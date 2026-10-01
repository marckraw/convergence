import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import type {
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
} from '@/entities/project-script'
import { DropdownMenu, DropdownMenuTrigger } from '@convergence/ui'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { ProjectActionsMenuPresentational } from './project-actions-menu.presentational'
import { ProjectActionsTrigger } from './project-actions-trigger.presentational'
import type { ProjectActionItem } from './project-actions-menu.types'

const script = (
  id: string,
  name: string,
  command: string,
  icon: ProjectScript['icon'],
): ProjectScript => ({
  id,
  projectId: 'convergence',
  name,
  command,
  icon,
  cwd: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
})

const run = (
  scriptValue: ProjectScript,
  overrides: Partial<ProjectScriptRun>,
): ProjectScriptRun => ({
  id: `run-${scriptValue.id}`,
  scriptId: scriptValue.id,
  projectId: 'convergence',
  command: scriptValue.command,
  cwd: '/Users/marcin/Projects/Private/convergence',
  status: 'succeeded',
  startedAt: '2026-09-30T09:00:00.000Z',
  endedAt: '2026-09-30T09:01:12.000Z',
  exitCode: 0,
  signal: null,
  errorMessage: null,
  stdout: '',
  stderr: '',
  ...overrides,
})

const tests = script('tests', 'Run tests', 'npm run test:unit', 'test')
const build = script('build', 'Build', 'npm run build', 'build')
const lint = script('lint', 'Lint', 'npm run lint', 'check')

const items: ProjectActionItem[] = [
  {
    script: tests,
    latestRun: run(tests, {
      status: 'running',
      endedAt: null,
      exitCode: null,
    }),
    running: true,
  },
  {
    script: build,
    latestRun: run(build, {
      status: 'failed',
      exitCode: 1,
      stdout: 'vite v7 building for production...\n',
      stderr: 'error TS2307: Cannot find module "./missing"\n',
    }),
    running: false,
  },
  { script: lint, latestRun: null, running: false },
]

const liveOutput: ProjectScriptRunOutput[] = [
  {
    runId: 'run-tests',
    stream: 'stdout',
    text: ' ✓ src/entities/session/session.model.test.ts (42 tests)\n',
    sequence: 1,
    emittedAt: '2026-09-30T09:00:04.000Z',
  },
]

/*
 * Known gaps, each switched off only on the stories that draw it.
 */
// a11y-known: the panel is role="menu" but holds plain buttons, not menu
// items — fixed by the sweep (DS4)
const menuOfButtons = { id: 'aria-required-children', enabled: false }
// a11y-known: the running status (emerald-300) and the error banner
// (destructive on its own tint) are below 4.5:1 on the light theme — fixed by
// the sweep (DS4)
const lightStatusContrast = { id: 'color-contrast', enabled: false }
const knownGaps = (...rules: Array<{ id: string; enabled: boolean }>) => ({
  a11y: { config: { rules } },
})

type MenuProps = ComponentProps<typeof ProjectActionsMenuPresentational>

/** The menu open under its trigger, as the header draws it. */
function OpenMenu(props: MenuProps) {
  return (
    <DropdownMenu open modal={false}>
      <DropdownMenuTrigger asChild>
        <ProjectActionsTrigger selectedScript={tests} running />
      </DropdownMenuTrigger>
      <ProjectActionsMenuPresentational {...props} />
    </DropdownMenu>
  )
}

const meta = {
  title: 'Widgets/Project actions menu/Project actions menu',
  component: OpenMenu,
  args: {
    projectName: 'convergence',
    items,
    outputByRunId: { 'run-tests': liveOutput },
    expandedRunIds: new Set<string>(),
    error: null,
    isLane: false,
    onCreateLane: fn(),
    onRevealLane: fn(),
    onRun: fn(),
    onStop: fn(),
    onAdd: fn(),
    onEdit: fn(),
    onDelete: fn(),
    onToggleRun: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="flex h-[40rem] justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OpenMenu>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The project's actions: stop the running one, rerun the last, run a new
 * one, edit or delete each, add another, and make a lane.
 */
export const Default: Story = {
  parameters: knownGaps(menuOfButtons, lightStatusContrast),
  play: async ({ args, userEvent }) => {
    const menu = await screen.findByRole('menu')
    await waitFor(() => expect(menu).toBeVisible())
    await userEvent.click(
      within(menu).getByRole('button', { name: 'Stop Run tests' }),
    )
    await expect(args.onStop).toHaveBeenCalledWith(items[0].latestRun)
    await userEvent.click(
      within(menu).getByRole('button', { name: 'Run again Build' }),
    )
    await expect(args.onRun).toHaveBeenCalledWith(items[1])
    await userEvent.click(
      within(menu).getByRole('button', { name: 'Run Lint' }),
    )
    await expect(args.onRun).toHaveBeenLastCalledWith(items[2])

    const [, editBuild] = within(menu).getAllByRole('button', {
      name: 'Edit action',
    })
    await userEvent.click(editBuild)
    await expect(args.onEdit).toHaveBeenCalledWith(build)

    await userEvent.click(
      within(menu).getByRole('button', { name: /^Add action/ }),
    )
    await expect(args.onAdd).toHaveBeenCalledOnce()
    await userEvent.click(
      within(menu).getByRole('button', { name: /^Create lane…/ }),
    )
    await expect(args.onCreateLane).toHaveBeenCalledOnce()
    await expect(
      within(menu).queryByRole('button', { name: /^Reveal lane in Finder/ }),
    ).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  parameters: knownGaps(menuOfButtons),
  globals: { theme: 'dark' },
}

/** A run's output opens under it: where it ran, when, and what it said. */
export const Output: Story = {
  parameters: knownGaps(menuOfButtons, lightStatusContrast),
  args: { expandedRunIds: new Set(['run-build', 'run-tests']) },
  play: async ({ args, userEvent }) => {
    const menu = await screen.findByRole('menu')
    await waitFor(() =>
      expect(
        within(menu).getByText(/error TS2307: Cannot find module/),
      ).toBeVisible(),
    )
    // The running action shows its live output instead of the stored one.
    await expect(
      within(menu).getByText(/session\.model\.test\.ts \(42 tests\)/),
    ).toBeVisible()
    await expect(
      within(menu).getAllByText('stdin is not supported for project actions.'),
    ).toHaveLength(2)
    const [hide] = within(menu).getAllByRole('button', { name: 'Hide output' })
    await userEvent.click(hide)
    await expect(args.onToggleRun).toHaveBeenCalledWith('run-tests')
  },
}

/** A lane offers a sibling lane and a way to its folder. */
export const Lane: Story = {
  parameters: knownGaps(menuOfButtons, lightStatusContrast),
  args: { isLane: true },
  play: async ({ args, userEvent }) => {
    const menu = await screen.findByRole('menu')
    await userEvent.click(
      await within(menu).findByRole('button', {
        name: /^Reveal lane in Finder/,
      }),
    )
    await expect(args.onRevealLane).toHaveBeenCalledOnce()
  },
}

/** An action that could not start says why at the top. */
export const Failed: Story = {
  parameters: knownGaps(menuOfButtons, lightStatusContrast),
  args: {
    error: 'Could not start "Build": npm was not found on PATH.',
  },
  play: async () => {
    const menu = await screen.findByRole('menu')
    await waitFor(() =>
      expect(
        within(menu).getByText(
          'Could not start "Build": npm was not found on PATH.',
        ),
      ).toBeVisible(),
    )
  },
}

/** No actions yet: only the way to add one, and lanes. */
export const Empty: Story = {
  parameters: knownGaps(menuOfButtons),
  args: { items: [] },
  play: async () => {
    const menu = await screen.findByRole('menu')
    await expect(
      within(menu).queryByRole('button', { name: 'Edit action' }),
    ).toBeNull()
    await expect(
      within(menu).getByRole('button', { name: /^Add action/ }),
    ).toBeInTheDocument()
  },
}

/** Long names and commands are cut short in their rows. */
export const Long: Story = {
  parameters: knownGaps(menuOfButtons),
  args: {
    projectName: 'a-project-with-a-rather-long-name-that-will-not-fit',
    items: Array.from({ length: 8 }, (_, index) => ({
      script: script(
        `long-${index}`,
        `Build, sign and notarise the macOS release, step ${index + 1}`,
        `npm run package:mac -- --arch=arm64 --notarize --team-id=ABCDE12345 --step=${index + 1}`,
        'build',
      ),
      latestRun: null,
      running: false,
    })),
  },
  play: async () => {
    const menu = await screen.findByRole('menu')
    await expect(
      within(menu).getAllByRole('button', { name: /^Run Build, sign/ }),
    ).toHaveLength(8)
    await expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth)
  },
}
