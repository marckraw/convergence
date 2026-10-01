import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { FormRequestForm } from './form-request-form.presentational'

const meta = {
  title: 'Widgets/SessionView/FormRequestForm',
  component: FormRequestForm,
  args: {
    fields: [
      {
        id: 'branch',
        label: 'Branch name',
        description: 'Created from master.',
        type: 'string',
        required: true,
        defaultValue: 'fix/composer-focus',
      },
      {
        id: 'retries',
        label: 'Retries',
        type: 'number',
        required: false,
        defaultValue: 2,
      },
      {
        id: 'draft',
        label: 'Open as draft',
        type: 'boolean',
        required: false,
        defaultValue: true,
      },
    ],
    onSubmit: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-[32rem] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormRequestForm>

export default meta

type Story = StoryObj<typeof meta>

/** An MCP server asks for values; Submit sends them typed as the fields say. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const branch = canvas.getByRole('textbox', { name: /Branch name/ })
    await expect(branch).toBeRequired()
    await userEvent.clear(branch)
    await userEvent.type(branch, 'fix/popover-focus')
    const retries = canvas.getByRole('spinbutton', { name: /Retries/ })
    await userEvent.clear(retries)
    await userEvent.type(retries, '3')
    const draft = canvas.getByRole('checkbox', { name: /Open as draft/ })
    await expect(draft).toBeChecked()
    await userEvent.click(draft)
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        kind: 'form',
        action: 'accept',
        values: { branch: 'fix/popover-focus', retries: 3, draft: false },
      },
      'Branch name\nfix/popover-focus\n\nRetries\n3\n\nOpen as draft\nfalse',
    )
  },
}

/** Decline skips validation: an empty required field does not stop it. */
export const Declined: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.clear(canvas.getByRole('textbox', { name: /Branch name/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Decline' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      { kind: 'form', action: 'decline', values: {} },
      'Declined form request',
    )
  },
}

/** A required field left empty: Submit sends nothing. */
export const Failed: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const branch = canvas.getByRole('textbox', { name: /Branch name/ })
    await userEvent.clear(branch)
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }))
    await expect(branch).toBeInvalid()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** A long multi-line field and long labels. */
export const Long: Story = {
  args: {
    fields: [
      {
        id: 'summary',
        label:
          'Summary of the change, as it should read in the release notes for this version',
        description:
          'Markdown is fine. Keep it to what a person installing the build would notice.',
        type: 'string',
        required: true,
        multiline: true,
        defaultValue:
          'The composer keeps its focus when a picker closes.\n\nPreviously, closing the skill picker with Escape returned focus to the page body, so the next keystroke went nowhere.',
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('textbox', { name: /Summary of the change/ }),
    ).toHaveValue(
      'The composer keeps its focus when a picker closes.\n\nPreviously, closing the skill picker with Escape returned focus to the page body, so the next keystroke went nowhere.',
    )
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}
