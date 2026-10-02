import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { QueuedInputs } from './queued-inputs.presentational'
import type { QueuedInputView } from './queued-inputs.pure'

const waiting: QueuedInputView = {
  id: 'q-1',
  mode: 'Follow-up',
  state: 'Waiting for the next turn',
  preview: 'Then run the gates and open the pull request.',
  error: null,
  canDeliverNow: false,
  cancelUnavailable: null,
}

const meta = {
  title: 'Features/Composer/QueuedInputs',
  component: QueuedInputs,
  args: {
    inputs: [
      waiting,
      {
        id: 'q-2',
        mode: 'Steer',
        state: 'Dispatching',
        preview: '2 attachments',
        error: null,
        canDeliverNow: false,
        cancelUnavailable: 'It is being delivered now.',
      },
    ],
    onDeliverNow: fn(),
    onCancel: fn(),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof QueuedInputs>

export default meta

type Story = StoryObj<typeof meta>

/** Two inputs behind a running turn: how each goes, when, and what it carries. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Waiting for the next turn')).toBeVisible()
    const [cancelWaiting, cancelSending] = canvas.getAllByRole('button', {
      name: 'Cancel queued input',
    })
    await userEvent.click(cancelWaiting!)
    await expect(args.onCancel).toHaveBeenCalledWith('q-1')
    // Past the point of cancelling: still reachable, and it says why (R2).
    await expect(cancelSending).toHaveAttribute('aria-disabled', 'true')
    await expect(cancelSending).toHaveAccessibleDescription(
      'It is being delivered now.',
    )
    await expect(
      canvas.queryByRole('button', { name: 'Deliver now' }),
    ).toBeNull()
  },
}

/** A failed one: what went wrong, and Deliver now, once. */
export const Failed: Story = {
  args: {
    inputs: [
      {
        ...waiting,
        state: 'Failed',
        error: 'The provider refused the follow-up: rate limited.',
        canDeliverNow: true,
      },
    ],
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('The provider refused the follow-up: rate limited.'),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Deliver now' }))
    await expect(args.onDeliverNow).toHaveBeenCalledWith('q-1')
  },
}

/** Long words are cut to one line. */
export const Long: Story = {
  args: {
    inputs: [
      {
        ...waiting,
        state: 'Waits for compaction',
        preview:
          'Once the drill has finished, read the summary it left, compare it with the plan in the pull request description, and tell me which steps are still owed before we can ship this.',
      },
    ],
  },
}

/** Nothing queued: nothing drawn. */
export const Empty: Story = {
  args: { inputs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByTestId('queued-inputs')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
