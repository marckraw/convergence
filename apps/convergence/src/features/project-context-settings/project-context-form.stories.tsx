import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ProjectContextForm } from './project-context-form.presentational'

const meta = {
  title: 'Features/ProjectContextSettings/ProjectContextForm',
  component: ProjectContextForm,
  args: {
    mode: 'create',
    label: 'monorepo-api',
    body: 'The API lives in packages/api. Run its tests with npm test -w api, never from the root.',
    reinjectMode: 'boot',
    isSaving: false,
    error: null,
    onLabelChange: fn(),
    onBodyChange: fn(),
    onReinjectModeChange: fn(),
    onSubmit: fn(),
    onCancel: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-130">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectContextForm>

export default meta

type Story = StoryObj<typeof meta>

/** A new item: an optional label, a body, and how often it is sent. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(/Label/), 's')
    await expect(args.onLabelChange).toHaveBeenCalledWith('monorepo-apis')
    await userEvent.type(canvas.getByLabelText('Body'), '!')
    await expect(args.onBodyChange).toHaveBeenCalled()
    await expect(canvas.getByText('87 characters')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('switch', { name: 'Re-inject every turn' }),
    )
    await expect(args.onReinjectModeChange).toHaveBeenCalledWith('every-turn')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add context item' }),
    )
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancel).toHaveBeenCalledOnce()
  },
}

/** Editing, sent every turn: the warning about the cost shows. */
export const EveryTurn: Story = {
  name: 'Edit, every turn',
  args: { mode: 'edit', reinjectMode: 'every-turn' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('switch', { name: 'Re-inject every turn' }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(
      canvas.getByRole('alert', { name: 'Re-sent with every message' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }))
    await expect(args.onSubmit).toHaveBeenCalledOnce()
  },
}

/** Empty: nothing to save until the body has text. */
export const Empty: Story = {
  args: { label: '', body: '' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Body')).toBeRequired()
    const add = canvas.getByRole('button', { name: 'Add context item' })
    await expect(add).toHaveAttribute('aria-disabled', 'true')
    await expect(add).toHaveAccessibleDescription('Write the body first.')
    await expect(canvas.getByText('0 characters')).toBeVisible()
  },
}

/** Busy: saving locks the form, and the button says it is saving. */
export const Busy: Story = {
  args: { isSaving: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Saving…' }),
    ).toHaveAttribute('aria-busy', 'true')
    await expect(canvas.getByLabelText('Body')).toBeDisabled()
    await expect(
      canvas.getByRole('switch', { name: 'Re-inject every turn' }),
    ).toBeDisabled()
  },
}

/** Failed: the error is announced above the buttons. */
export const Failed: Story = {
  args: { error: 'A context item with this label already exists.' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(/already exists/)
  },
}

export const Dark: Story = {
  ...EveryTurn,
  name: 'Dark',
  globals: { theme: 'dark' },
}
