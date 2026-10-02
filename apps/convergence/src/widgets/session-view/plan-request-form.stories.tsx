import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { PlanRequestForm } from './plan-request-form.presentational'

const meta = {
  title: 'Widgets/SessionView/PlanRequestForm',
  component: PlanRequestForm,
  args: { onSubmit: fn() },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-128 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlanRequestForm>

export default meta

type Story = StoryObj<typeof meta>

/** Approve the agent's plan as it stands. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Approve plan' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      { kind: 'plan', decision: 'approve' },
      'Approved plan',
    )
  },
}

/** Reject with notes: the notes go back to the agent. */
export const Rejected: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Why you deny the plan' }),
      'Keep the migration out of this PR.',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Deny plan' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        kind: 'plan',
        decision: 'reject',
        message: 'Keep the migration out of this PR.',
      },
      'Denied plan\n\nKeep the migration out of this PR.',
    )
  },
}

/** Reject with nothing written: a bare rejection. */
export const Empty: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Deny plan' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      { kind: 'plan', decision: 'reject', message: undefined },
      'Denied plan',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
