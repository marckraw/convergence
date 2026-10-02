import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ChoiceRequestForm } from './choice-request-form.container'
import { ChoiceRequestFormView } from './choice-request-form.presentational'

const meta = {
  title: 'Widgets/SessionView/ChoiceRequestForm',
  component: ChoiceRequestForm,
  args: {
    questions: [
      {
        id: 'q-storage',
        header: 'Storage',
        question: 'Where should the draft queue live?',
        multiSelect: false,
        options: [
          {
            label: 'SQLite',
            description: 'Survives a restart, one more table to migrate.',
          },
          {
            label: 'Memory',
            description: 'Simplest; drafts vanish when the app quits.',
          },
        ],
      },
    ],
    onSubmit: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-128 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChoiceRequestForm>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The form through its container, which holds the answers (CONV-30).
 *
 * One question, one answer: a radio group of cards (CONV-9), named by its
 * header and described by the question, the first option chosen. The
 * arrow keys move the choice; answering sends it.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const group = canvas.getByRole('radiogroup', { name: 'Storage' })
    await expect(group).toHaveAccessibleDescription(
      'Where should the draft queue live?',
    )
    const sqlite = canvas.getByRole('radio', { name: 'SQLite' })
    const memory = canvas.getByRole('radio', { name: 'Memory' })
    await expect(sqlite).toBeChecked()
    await expect(memory).toHaveAccessibleDescription(
      'Simplest; drafts vanish when the app quits.',
    )
    await userEvent.click(memory)
    await expect(memory).toBeChecked()
    await expect(sqlite).not.toBeChecked()
    await userEvent.keyboard('{ArrowUp}')
    await expect(sqlite).toBeChecked()
    await userEvent.click(memory)
    await userEvent.click(canvas.getByRole('button', { name: 'Answer' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        kind: 'choice',
        answers: [{ questionId: 'q-storage', values: ['Memory'] }],
      },
      'Where should the draft queue live?\nMemory',
    )
  },
}

/** Several answers allowed: checkboxes, nothing ticked at first, so Answer waits. */
export const Disabled: Story = {
  args: {
    questions: [
      {
        id: 'q-checks',
        header: 'Checks',
        question: 'Which gates should run before the PR?',
        multiSelect: true,
        options: [
          { label: 'Typecheck' },
          { label: 'Unit tests' },
          { label: 'Story tests' },
        ],
      },
    ],
  },
  play: async ({ args, canvas, userEvent }) => {
    const answer = canvas.getByRole('button', { name: 'Answer' })
    await expect(answer).toBeDisabled()
    await expect(
      canvas.getByRole('group', { name: 'Checks' }),
    ).toHaveAccessibleDescription('Which gates should run before the PR?')
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Typecheck' }))
    await userEvent.click(canvas.getByText('Story tests'))
    await expect(answer).toBeEnabled()
    await userEvent.click(answer)
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        kind: 'choice',
        answers: [
          { questionId: 'q-checks', values: ['Typecheck', 'Story tests'] },
        ],
      },
      'Which gates should run before the PR?\nTypecheck, Story tests',
    )
  },
}

/** Many questions and long options, as an agent planning a migration asks them. */
export const Long: Story = {
  args: {
    questions: [
      {
        id: 'q-scope',
        header: 'Scope',
        question:
          'The migration touches 41 files across three slices. How much of it should land in this pull request?',
        multiSelect: false,
        options: [
          {
            label: 'Everything at once',
            description:
              'One review, one release; the diff is large but every screen moves together and nothing is half-migrated in between.',
          },
          {
            label: 'Slice by slice',
            description:
              'Three smaller pull requests: composer first, then the session view, then the chat surface.',
          },
        ],
      },
      {
        id: 'q-flags',
        header: 'Rollout',
        question: 'Should the new surfaces sit behind a setting?',
        multiSelect: false,
        options: [{ label: 'Yes, off by default' }, { label: 'No' }],
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('radiogroup')).toHaveLength(2)
    await expect(canvas.getByRole('button', { name: 'Answer' })).toBeEnabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * The view alone, props in and markup out: these answers chosen, and a
 * press on an option asks the container to choose it.
 */
const onChoose = fn()

export const Chosen: Story = {
  render: (args) => (
    <ChoiceRequestFormView
      questions={args.questions}
      answers={{ 'q-storage': ['Memory'] }}
      canSubmit
      onChoose={onChoose}
      onSubmit={() => {}}
    />
  ),
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('radio', { name: 'Memory' })).toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: 'SQLite' }))
    await expect(onChoose).toHaveBeenCalledWith(args.questions[0], 'SQLite')
    // Nothing is held here: the choice stays where the props put it.
    await expect(canvas.getByRole('radio', { name: 'Memory' })).toBeChecked()
  },
}
