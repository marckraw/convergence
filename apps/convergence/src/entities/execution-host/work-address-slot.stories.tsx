import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import type { WorkAddressChoice } from './work-address-slot.pure'
import { WorkAddressSlot } from './work-address-slot.presentational'

const choices: WorkAddressChoice[] = [
  {
    id: 'project:convergence',
    label: 'convergence (project)',
    address: {
      mode: 'project',
      projectId: 'remote-project-1',
      workingDirectory: '/home/marcin/Projects/convergence',
      label: 'convergence',
    },
  },
  {
    id: 'repository:marckraw/convergence',
    label: 'marckraw/convergence (fresh clone)',
    address: {
      mode: 'repository',
      repository: 'https://github.com/marckraw/convergence',
      branchName: null,
      label: 'marckraw/convergence',
    },
  },
]

const meta = {
  title: 'Entities/Execution host/Work address slot',
  component: WorkAddressSlot,
  args: {
    view: {
      mode: 'choosing',
      choices,
      selectedId: choices[1].id,
      address: choices[1].address,
      branch: {
        value: '',
        statement: 'The daemon names a new branch',
      },
      notice: null,
    },
    disabled: false,
    onChange: fn(),
    onBranchChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-2 py-1.5 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkAddressSlot>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Before the first turn on a remote machine: choose where it works, and write
 * the branch it should work on.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Works in')).toBeVisible()
    await expect(
      canvas.getByText('The daemon names a new branch'),
    ).toBeVisible()

    const branch = canvas.getByRole('textbox', {
      name: 'Branch the daemon should work on',
    })
    await userEvent.type(branch, 'a')
    await expect(args.onBranchChange).toHaveBeenCalledWith('a')

    const place = canvas.getByRole('combobox', {
      name: 'marckraw/convergence (fresh clone)',
    })
    await userEvent.click(place)
    await userEvent.click(
      await screen.findByRole('option', { name: /convergence \(project\)/ }),
    )
    await expect(args.onChange).toHaveBeenCalledWith('project:convergence')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Nothing preselected: the chooser asks for a place, and there is no branch yet. */
export const Unchosen: Story = {
  args: {
    view: {
      mode: 'choosing',
      choices,
      selectedId: null,
      address: null,
      branch: null,
      notice: 'Pick where this conversation works before you send.',
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Choose a place' }),
    ).toBeEnabled()
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await expect(
      canvas.getByText('Pick where this conversation works before you send.'),
    ).toBeVisible()
  },
}

/** While a turn is in flight, the place and the branch cannot change. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', {
        name: 'marckraw/convergence (fresh clone)',
      }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('textbox', { name: 'Branch the daemon should work on' }),
    ).toBeDisabled()
  },
}

/** Live: a statement of where it works, and the branch asked for but not cut. */
export const Settled: Story = {
  args: {
    view: {
      mode: 'settled',
      label: 'marckraw/convergence @ agent/mar-2694-branch-field',
      requestedBranch: 'feature/branch-field',
      notice: 'The daemon cut its own branch.',
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('marckraw/convergence @ agent/mar-2694-branch-field'),
    ).toBeVisible()
    await expect(
      canvas.getByText('requested feature/branch-field'),
    ).toBeVisible()
    await expect(canvas.queryByRole('combobox')).toBeNull()
  },
}

/** The machine has not answered yet: a sentence, not a chooser. */
export const Busy: Story = {
  args: {
    view: { mode: 'asking', text: 'Asking little-monster for its projects…' },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Asking little-monster for its projects…'),
    ).toBeVisible()
    await expect(canvas.queryByRole('combobox')).toBeNull()
  },
}

/** The machine could not say where it can work. */
export const Failed: Story = {
  args: {
    view: {
      mode: 'unavailable',
      text: 'little-monster did not answer. Its projects are unavailable.',
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        'little-monster did not answer. Its projects are unavailable.',
      ),
    ).toBeVisible()
  },
}

/** On this Mac the slot draws nothing at all. */
export const Empty: Story = {
  args: { view: { mode: 'hidden' } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('Works in')).toBeNull()
  },
}
