import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Input } from '../input/input'
import { Field, FieldDescription, FieldError, FieldLabel } from './field'

const meta = {
  title: 'Components/Field',
  component: Field,
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>

export default meta

type Story = StoryObj<typeof meta>

/** The label names the control and the hint describes it: no ids passed by hand. */
export const Default: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldLabel>Project name</FieldLabel>
      <Input size="lg" placeholder="convergence" />
      <FieldDescription>
        Shown in the sidebar and the window title.
      </FieldDescription>
    </Field>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText('Project name')
    await expect(input).toHaveAccessibleDescription(
      'Shown in the sidebar and the window title.',
    )
    await userEvent.click(canvas.getByText('Project name'))
    await expect(input).toHaveFocus()
    await userEvent.keyboard('emergence')
    await expect(input).toHaveValue('emergence')
  },
}

/** Failed: the error is announced at once, marks the control invalid and describes it. */
export const Failed: Story = {
  render: (args) => (
    <Field {...args} invalid>
      <FieldLabel>Branch name</FieldLabel>
      <Input size="lg" defaultValue="feature/one two" />
      <FieldError match>
        Couldn’t use that name. Branch names have no spaces.
      </FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Branch name')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveAccessibleDescription(
      'Couldn’t use that name. Branch names have no spaces.',
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Couldn’t use that name.',
    )
  },
}

/** Disabled: the label, the hint and the control dim together; the control takes no focus. */
export const Disabled: Story = {
  render: (args) => (
    <Field {...args} disabled>
      <FieldLabel>Worktree folder</FieldLabel>
      <Input size="lg" defaultValue="~/Projects/convergence" />
      <FieldDescription>Set when the project was added.</FieldDescription>
    </Field>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText('Worktree folder')
    await expect(input).toBeDisabled()
    await userEvent.tab()
    await expect(input).not.toHaveFocus()
  },
}

/** Long: the label and the hint wrap; the control keeps its height. */
export const Long: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldLabel>
        What should the agents call this project when they write a pull request
        or a summary for it?
      </FieldLabel>
      <Input size="lg" defaultValue="Convergence" />
      <FieldDescription>
        Agents use it in titles and summaries. The folder's name stays as it is,
        and you can change this whenever you like.
      </FieldDescription>
    </Field>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox')
    await expect(input.getBoundingClientRect().height).toBe(36)
  },
}

/** Caption: a dense panel's label, 11 px and muted, as Mission Control's inspectors draw it. */
export const Caption: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldLabel variant="caption">Baton name</FieldLabel>
      <Input size="md" className="text-xs" defaultValue="horse" />
    </Field>
  ),
  play: async ({ canvas }) => {
    const label = canvas.getByText('Baton name')
    await expect(getComputedStyle(label).fontSize).toBe('11px')
    await expect(canvas.getByLabelText('Baton name')).toHaveValue('horse')
  },
}

export const Dark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}
