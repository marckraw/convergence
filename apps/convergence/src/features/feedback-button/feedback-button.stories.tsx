import type { Meta, StoryObj } from '@storybook/react-vite'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { FeedbackButton } from './feedback-button.presentational'

const meta = {
  title: 'Features/Feedback button/Feedback button',
  component: FeedbackButton,
  args: {
    open: false,
    priority: 'medium',
    title: '',
    description: '',
    contact: '',
    error: null,
    submitting: false,
    onOpenChange: fn(),
    onPriorityChange: fn(),
    onTitleChange: fn(),
    onDescriptionChange: fn(),
    onContactChange: fn(),
    onSubmit: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="relative h-[36rem] bg-background">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof FeedbackButton>

export default meta

type Story = StoryObj<typeof meta>

/** The floating corner button: named, and it opens the request form. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Send feedback' })
    await userEvent.click(button)
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
    await expect(screen.queryByRole('dialog')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * The form, empty: Send waits for a title and a description; the priority
 * is three toggles, one of them on.
 */
export const Open: Story = {
  args: { open: true },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Request a feature',
    })
    await waitFor(() => expect(dialog).toBeVisible())
    const form = within(dialog)
    await expect(form.getByRole('button', { name: 'Send' })).toBeDisabled()
    await expect(form.getByRole('button', { name: 'Medium' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.type(form.getByRole('textbox', { name: 'Title' }), 'E')
    await expect(args.onTitleChange).toHaveBeenCalledWith('E')
    await userEvent.type(
      form.getByRole('textbox', { name: 'Description' }),
      'W',
    )
    await expect(args.onDescriptionChange).toHaveBeenCalledWith('W')
    await userEvent.click(form.getByRole('button', { name: 'High' }))
    await expect(args.onPriorityChange).toHaveBeenCalledWith('high')

    await userEvent.click(form.getByRole('button', { name: 'Cancel' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

export const OpenDark: Story = {
  ...Open,
  name: 'Open, dark',
  globals: { theme: 'dark' },
}

/** Filled in: Send is on, and Enter in the form sends it too. */
export const Filled: Story = {
  args: {
    open: true,
    priority: 'high',
    title: 'Export a conversation to Markdown',
    description:
      'I want to keep a conversation next to the code it changed, as a Markdown file.',
    contact: 'marcin@example.com',
  },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Request a feature',
    })
    const send = within(dialog).getByRole('button', { name: 'Send' })
    await expect(send).toBeEnabled()
    await userEvent.click(send)
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    within(dialog).getByRole('textbox', { name: 'Title' }).focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onSubmit).toHaveBeenCalledTimes(2)
  },
}

/** Sending: nothing can be sent or cancelled twice. */
export const Busy: Story = {
  args: { ...Filled.args, submitting: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Request a feature',
    })
    await expect(
      within(dialog).getByRole('button', { name: 'Send' }),
    ).toBeDisabled()
    await expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
  },
}

/** A request that could not be sent says why, inside the form. */
export const Failed: Story = {
  args: {
    ...Filled.args,
    error: 'The feedback service did not answer. Try again in a minute.',
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Request a feature',
    })
    await waitFor(() =>
      expect(
        within(dialog).getByText(
          'The feedback service did not answer. Try again in a minute.',
        ),
      ).toBeVisible(),
    )
  },
}
