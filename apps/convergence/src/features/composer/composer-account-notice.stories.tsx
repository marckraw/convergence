import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ComposerAccountNotice } from './composer-account-notice.presentational'

const meta = {
  title: 'Features/Composer/ComposerAccountNotice',
  component: ComposerAccountNotice,
  args: {
    notice: { kind: 'staged' },
    onManageAccounts: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-128 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ComposerAccountNotice>

export default meta

type Story = StoryObj<typeof meta>

/** A different account is chosen for the next turn. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('status', {
        name: 'Your next turn will use the selected account.',
      }),
    ).toHaveTextContent('Your conversation is preserved.')
  },
}

/** Switching: the message has not been taken yet. */
export const Busy: Story = {
  args: { notice: { kind: 'pending' } },
  play: async ({ canvas }) => {
    const status = canvas.getByRole('status', { name: 'Switching accounts…' })
    await expect(status).toHaveTextContent(
      'Your message has not been accepted yet.',
    )
  },
}

/** The switch was refused, and the message was not sent. */
export const Failed: Story = {
  args: {
    notice: {
      kind: 'refused',
      refusal: {
        accepted: false,
        stage: 'layout',
        message:
          'The work account keeps its history in ~/.claude-work, which this conversation was not started from.',
      },
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const alert = canvas.getByRole('alert')
    await expect(alert).toHaveTextContent(/^Not sent · /)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Manage accounts' }),
    )
    await expect(args.onManageAccounts).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}
