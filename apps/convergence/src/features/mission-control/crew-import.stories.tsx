import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type {
  CrewImportPlan,
  CrewImportRow,
} from '@/shared/types/crew-import.types'
import { CrewImportView } from './crew-import.presentational'

const row = (
  key: string,
  state: CrewImportRow['state'],
  overrides: Partial<CrewImportRow> = {},
): CrewImportRow => ({
  key,
  label: key,
  state,
  detail: state,
  differences: [],
  canUpdate: false,
  options: [],
  ...overrides,
})

const plan: CrewImportPlan = {
  path: '/Users/marcin/recipes/convergence-development.crew.yaml',
  revision: 'rev-1',
  crew: { ...row('convergence development', 'existing'), id: 'crew-1' },
  roles: [
    {
      ...row('opus-mac', 'differs', {
        canUpdate: true,
        differences: ['model'],
        detail: 'differs: model (file: Opus 5, here: Sonnet 5)',
      }),
      role: 'horse',
      sessionId: 'session-opus',
      projectId: 'project-convergence',
    },
    {
      ...row('reviewer', 'choose', {
        detail: 'two conversations could take this seat',
        options: [
          { value: 'session-sol', label: 'Sol' },
          { value: 'session-astra', label: 'Astra' },
        ],
      }),
      role: 'reviewer',
      sessionId: null,
      projectId: 'project-convergence',
    },
  ],
  wires: [],
  limits: row('loop limits', 'existing'),
  kept: [row('a local wire', 'kept')],
  hasLayout: true,
  canApply: true,
}

const decisions = {
  revision: 'rev-1',
  choices: {},
  updates: {},
  includeLayout: true,
}

const meta = {
  title: 'Features/MissionControl/CrewImport',
  component: CrewImportView,
  args: {
    plan,
    decisions,
    report: null,
    busy: false,
    error: null,
    onClose: fn(),
    onApply: fn(),
    onChoice: fn(),
    onUpdate: fn(),
    onIncludeLayout: fn(),
    onChooseFolder: fn(),
  },
} satisfies Meta<typeof CrewImportView>

export default meta

type Story = StoryObj<typeof meta>

/** The dialog, open and settled, for every story. */
const openDialog = async () => {
  const dialog = await screen.findByRole('dialog')
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}

/**
 * The file reviewed against this machine: a row per crew, seat, wire and
 * limit, each with its state and the decision it needs.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('heading', { name: 'Import crew' }),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('rowheader', { name: 'a local wire' }),
    ).toBeVisible()
    const update = within(dialog).getByRole('checkbox', {
      name: 'Update opus-mac to file',
    })
    await expect(update).toBeChecked()
    await userEvent.click(update)
    await expect(args.onUpdate).toHaveBeenCalledWith('opus-mac', false)
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Choose reviewer' }),
      'session-astra',
    )
    await expect(args.onChoice).toHaveBeenCalledWith(
      'reviewer',
      'session-astra',
    )
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Include layout' }),
    )
    await expect(args.onIncludeLayout).toHaveBeenCalledWith(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await expect(args.onApply).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A project the file names is missing here: the row offers a folder. */
export const Long: Story = {
  args: {
    plan: {
      ...plan,
      canApply: false,
      roles: [
        {
          ...row('designer', 'missing-project', {
            detail:
              'the file names a project at /Users/marcin/Projects/Private/backpack-studio that this machine does not have',
          }),
          role: 'designer',
          sessionId: null,
          projectId: null,
        },
      ],
    },
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Choose folder…' }),
    )
    await expect(args.onChooseFolder).toHaveBeenCalledOnce()
    await expect(
      within(dialog).getByRole('button', { name: 'Apply' }),
    ).toBeDisabled()
  },
}

/** Applying: every decision waits, and the dialog will not close. */
export const Busy: Story = {
  args: { busy: true },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('button', { name: 'Working…' }),
    ).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).not.toHaveBeenCalled()
  },
}

/** The import was refused: the reason first, above the plan. */
export const Failed: Story = {
  args: { error: 'The file changed on disk since it was read. Read it again.' },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The file changed on disk since it was read.',
    )
  },
}

/** The report after applying: what happened to each row, then Close. */
export const Report: Story = {
  args: {
    report: {
      path: plan.path,
      crewId: 'crew-1',
      nothingToChange: false,
      entries: [
        { key: 'opus-mac', label: 'opus-mac', outcome: 'updated' },
        {
          key: 'reviewer',
          label: 'reviewer',
          outcome: 'not updated',
          reason: 'the conversation is running',
        },
      ],
    },
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('heading', { name: 'Crew import report' }),
    ).toBeVisible()
    await expect(dialog).toHaveTextContent(
      'reviewer — not updated: the conversation is running',
    )
    // The dialog's own corner close and the report's footer Close share a
    // name; the footer's is the last.
    const closes = within(dialog).getAllByRole('button', { name: 'Close' })
    await expect(closes).toHaveLength(2)
    await userEvent.click(closes.at(-1)!)
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

/** Nothing in the file differs from this machine. */
export const Empty: Story = {
  args: {
    report: {
      path: plan.path,
      crewId: 'crew-1',
      nothingToChange: true,
      entries: [],
    },
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByText('Nothing to change.')).toBeVisible()
  },
}
