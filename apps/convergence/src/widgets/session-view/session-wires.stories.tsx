import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, waitFor } from 'storybook/test'
import { SessionWires } from './session-wires.presentational'

const meta = {
  title: 'Widgets/SessionView/SessionWires',
  component: SessionWires,
  args: {
    lines: [
      {
        relayId: 'relay-review',
        armed: true,
        text: 'When this finishes, send its last message to Independent review.',
      },
      {
        relayId: 'relay-notes',
        armed: false,
        text: 'When this finishes, append a summary to Release notes.',
      },
    ],
    armedCount: 1,
    summary: '2 wires leave this session · 1 armed',
  },
} satisfies Meta<typeof SessionWires>

export default meta

type Story = StoryObj<typeof meta>

/** A chip that counts the wires; it opens them read out in full. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const chip = canvas.getByRole('button', { name: args.summary })
    await userEvent.click(chip)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(
        screen.getByText(
          'When this finishes, send its last message to Independent review.',
        ),
      ).toBeVisible(),
    )
    await expect(dialog).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(chip).toHaveFocus()
  },
}

/** Every wire switched off: the chip goes quiet. */
export const Disabled: Story = {
  args: {
    lines: [
      {
        relayId: 'relay-review',
        armed: false,
        text: 'When this finishes, send its last message to Independent review.',
      },
    ],
    armedCount: 0,
    summary: '1 wire leaves this session · none armed',
  },
  play: async ({ args, canvas }) => {
    await expect(
      canvas.getByRole('button', { name: args.summary }),
    ).toBeVisible()
  },
}

/** Nothing leaves this session: nothing is drawn. */
export const Empty: Story = {
  args: { lines: [], armedCount: 0, summary: 'No wires' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
