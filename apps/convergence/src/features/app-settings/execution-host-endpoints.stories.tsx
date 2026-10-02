import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ExecutionHostEndpointsFields } from './execution-host-endpoints.presentational'

/*
 * The list's own states. A row is ExecutionHostSettingsContainer, which asks
 * the main process for its token's status as it mounts, so rows are shown
 * by ExecutionHostFields' stories, not here: these stories hold no rows.
 */
const meta = {
  title: 'Features/AppSettings/ExecutionHostEndpoints',
  component: ExecutionHostEndpointsFields,
  args: {
    drafts: [],
    savedEndpoints: [],
    sessionCounts: { status: 'counting' },
    environmentOverrideWarning: null,
    onAdd: fn(),
    onLabelChange: fn(),
    onBaseUrlChange: fn(),
    onRemove: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExecutionHostEndpointsFields>

export default meta

type Story = StoryObj<typeof meta>

/** Empty: no endpoints, so sessions run here; Add endpoint starts one. */
export const Empty: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('No execution host endpoints')).toBeVisible()
    await expect(
      canvas.getByText('Sessions run on this machine.'),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Add endpoint' }))
    await expect(args.onAdd).toHaveBeenCalledOnce()
  },
}

/** The environment's token serves no endpoint, and the list says so first. */
export const Failed: Story = {
  args: {
    environmentOverrideWarning:
      'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN is set, but no endpoint carries its id, so it authenticates nothing.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'authenticates nothing',
    )
  },
}

export const Dark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}
