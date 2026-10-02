import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { expect, fn } from 'storybook/test'
import { AnnotationSelectionPopover } from './annotation-selection-popover.presentational'

/** The popover with its comment draft held the way the container holds it. */
function HeldPopover(props: ComponentProps<typeof AnnotationSelectionPopover>) {
  const [commentValue, setCommentValue] = useState(props.commentValue)
  return (
    <AnnotationSelectionPopover
      {...props}
      commentValue={commentValue}
      onCommentValueChange={(next) => {
        setCommentValue(next)
        props.onCommentValueChange(next)
      }}
    />
  )
}

const meta = {
  title: 'Features/ResponseAnnotations/AnnotationSelectionPopover',
  component: AnnotationSelectionPopover,
  args: {
    // Viewport coordinates above a selection, as the container measures them.
    position: { top: 160, left: 260 },
    quotedExcerpt: 'I rewrote the scheduler so retries back off exponentially.',
    isCommenting: false,
    commentValue: '',
    onCommentValueChange: fn(),
    onStartComment: fn(),
    onSubmitComment: fn(),
    onReact: fn(),
    onDismiss: fn(),
  },
  render: (args) => <HeldPopover {...args} />,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-80 bg-canvas p-6">
        <p className="mt-32 max-w-md text-sm text-ink">
          I rewrote the scheduler so retries back off exponentially.
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnnotationSelectionPopover>

export default meta

type Story = StoryObj<typeof meta>

/** Over a selection: react in one click, or start a comment. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'React with 👍' }))
    await expect(args.onReact).toHaveBeenCalledWith('👍')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Comment on the selected text' }),
    )
    await expect(args.onStartComment).toHaveBeenCalledOnce()
  },
}

/** Commenting: the field takes focus; Add sends, × cancels. */
export const Commenting: Story = {
  args: { isCommenting: true },
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', {
      name: 'Comment on the selected text',
    })
    await expect(field).toHaveFocus()
    await userEvent.type(field, 'Why not jittered?')
    await expect(args.onCommentValueChange).toHaveBeenLastCalledWith(
      'Why not jittered?',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
    await expect(args.onSubmitComment).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Cancel comment' }),
    )
    await expect(args.onDismiss).toHaveBeenCalledOnce()
  },
}

/** A long quote is clamped to two lines above the field. */
export const Long: Story = {
  args: {
    isCommenting: true,
    quotedExcerpt:
      'Every popover in the composer now returns focus to the message field when it closes, including the skill picker, the context picker and the three inline injection pickers, whether it closed with Escape or a click outside.',
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const CommentingDark: Story = {
  ...Commenting,
  name: 'Commenting, dark',
  globals: { theme: 'dark' },
}
