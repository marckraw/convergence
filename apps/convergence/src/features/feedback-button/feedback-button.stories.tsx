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
        <div className="relative h-144 bg-background">
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
 * The form, under the button's own name: Send waits for a title and a
 * description, and says why; the priority is one choice of three, Medium on.
 */
export const Open: Story = {
  args: { open: true },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Send feedback',
    })
    await waitFor(() => expect(dialog).toBeVisible())
    const form = within(dialog)
    // Unavailable with a reason (R2): focusable, and its tooltip says why.
    await expect(form.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(
      form.getByRole('radiogroup', { name: 'Priority' }),
    ).toBeInTheDocument()
    await expect(form.getByRole('radio', { name: 'Medium' })).toBeChecked()

    await userEvent.type(form.getByRole('textbox', { name: 'Title' }), 'E')
    await expect(args.onTitleChange).toHaveBeenCalledWith('E')
    await userEvent.type(
      form.getByRole('textbox', { name: 'Description' }),
      'W',
    )
    await expect(args.onDescriptionChange).toHaveBeenCalledWith('W')
    await userEvent.click(form.getByRole('radio', { name: 'High' }))
    await expect(args.onPriorityChange).toHaveBeenCalledWith('high')
    // The word Priority names the group; it is not a control of its own.
    await userEvent.click(form.getByText('Priority'))
    await expect(args.onPriorityChange).toHaveBeenCalledTimes(1)

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
      name: 'Send feedback',
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

/** Sending: Send says so, and a second press sends nothing more. */
export const Busy: Story = {
  args: { ...Filled.args, submitting: true },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Send feedback',
    })
    const send = within(dialog).getByRole('button', { name: /Send/ })
    await waitFor(() => expect(send).toHaveAttribute('aria-busy', 'true'))
    await expect(send).toHaveTextContent('Sending…')
    await userEvent.click(send)
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

/** A request that could not be sent says why, over the buttons, and is announced. */
export const Failed: Story = {
  args: {
    ...Filled.args,
    error: 'The feedback service did not answer. Try again in a minute.',
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Send feedback',
    })
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'The feedback service did not answer. Try again in a minute.',
      ),
    )
  },
}
