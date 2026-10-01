import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ContextAlertFields } from './context-alert-fields.presentational'

const meta = {
  title: 'Features/AppSettings/ContextAlertFields',
  component: ContextAlertFields,
  args: {
    alert: { enabled: true, percent: 75, tokens: 400000 },
    isSaving: false,
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-140">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContextAlertFields>

export default meta

type Story = StoryObj<typeof meta>

/** A switch and two thresholds; a typed value is kept inside its range. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const percent = canvas.getByLabelText('Alert at % of the window')
    await expect(percent).toHaveValue(75)
    await userEvent.type(percent, '0')
    // 750 is past the range, so it comes back as 99, as the parser keeps it.
    await expect(args.onChange).toHaveBeenLastCalledWith({
      enabled: true,
      percent: 99,
      tokens: 400000,
    })
    await userEvent.clear(canvas.getByLabelText('…or at this many tokens'))
    await expect(args.onChange).toHaveBeenLastCalledWith({
      enabled: true,
      percent: 75,
      tokens: null,
    })
    await userEvent.click(
      canvas.getByRole('switch', {
        name: 'Warn me when a conversation fills up',
      }),
    )
    await expect(args.onChange).toHaveBeenLastCalledWith({
      enabled: false,
      percent: 75,
      tokens: 400000,
    })
  },
}

/** Off: the thresholds wait for the switch. No token cap is an empty field. */
export const Disabled: Story = {
  args: { alert: { enabled: false, percent: 75, tokens: null } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByLabelText('Alert at % of the window'),
    ).toBeDisabled()
    const tokens = canvas.getByLabelText('…or at this many tokens')
    await expect(tokens).toBeDisabled()
    await expect(tokens).toHaveValue(null)
  },
}

/** Busy: saving locks all three controls. */
export const Busy: Story = {
  args: { isSaving: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('switch', {
        name: 'Warn me when a conversation fills up',
      }),
    ).toBeDisabled()
    await expect(
      canvas.getByLabelText('Alert at % of the window'),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
