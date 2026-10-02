import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ExecutionBar } from './execution-bar.presentational'

const meta = {
  title: 'Features/Composer/ExecutionBar',
  component: ExecutionBar,
  args: {
    view: {
      mode: 'choosing',
      hostId: 'local',
      choices: [
        { id: 'local', label: 'Local' },
        { id: 'grok-mac', label: 'grok-mac' },
      ],
    },
    workAddress: { mode: 'hidden' },
    disabled: false,
    onChange: fn(),
    onWorkAddressChange: fn(),
    onWorkAddressBranchChange: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-conversation max-w-full">
        <div className="relative z-10 h-16 rounded-xl border border-border bg-card" />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExecutionBar>

export default meta

type Story = StoryObj<typeof meta>

/** While a session is being born: where it runs is a choice. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Runs on')).toBeVisible()
    await userEvent.click(canvas.getByRole('combobox', { name: 'Local' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'grok-mac' }),
    )
    await expect(args.onChange).toHaveBeenCalledWith('grok-mac')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** A remote machine chosen, and where on it the session will work. */
export const Remote: Story = {
  args: {
    view: {
      mode: 'choosing',
      hostId: 'grok-mac',
      choices: [
        { id: 'local', label: 'Local' },
        { id: 'grok-mac', label: 'grok-mac' },
      ],
    },
    workAddress: {
      mode: 'choosing',
      choices: [
        {
          id: 'repository',
          label: 'marckraw/convergence',
          address: {
            mode: 'repository',
            repository: 'https://github.com/marckraw/convergence.git',
            branchName: null,
            label: 'marckraw/convergence',
          },
        },
      ],
      selectedId: 'repository',
      address: null,
      branch: {
        value: '',
        statement: 'the daemon names a new branch',
      },
      notice: null,
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Works in')).toBeVisible()
    await userEvent.type(canvas.getByRole('textbox'), 'f')
    await expect(args.onWorkAddressBranchChange).toHaveBeenCalledWith('f')
  },
}

/** A live session: the machine is a fact, not a choice. */
export const Settled: Story = {
  args: {
    view: {
      mode: 'settled',
      hostId: 'grok-mac',
      label: 'grok-mac',
      warning: null,
    },
    workAddress: {
      mode: 'settled',
      label: 'marckraw/convergence @ agent/mar-3617',
      requestedBranch: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('combobox')).toBeNull()
    await expect(
      canvas.getByText('marckraw/convergence @ agent/mar-3617'),
    ).toBeVisible()
  },
}

/** The machine is asked where the session can work. */
export const Busy: Story = {
  args: {
    view: {
      mode: 'settled',
      hostId: 'grok-mac',
      label: 'grok-mac',
      warning: null,
    },
    workAddress: { mode: 'asking', text: 'Asking grok-mac for its projects…' },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Asking grok-mac for its projects…'),
    ).toBeVisible()
  },
}

/** The session names an endpoint that is no longer configured. */
export const Failed: Story = {
  args: {
    view: {
      mode: 'settled',
      hostId: 'old-mac',
      label: 'Removed endpoint (old-mac)',
      warning:
        'This session names "old-mac", an endpoint that is no longer configured, so it will refuse to run.',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/will refuse to run/)).toBeVisible()
  },
}

/** Locked while the session cannot change machine. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Local' })).toBeDisabled()
  },
}

/** No endpoints configured: nothing beneath the composer at all. */
export const Empty: Story = {
  args: { view: { mode: 'hidden', hostId: 'local' } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('Runs on')).toBeNull()
  },
}

export const Dark: Story = {
  ...Remote,
  globals: { theme: 'dark' },
}
