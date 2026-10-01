import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { expect, fn } from 'storybook/test'
import { AnnotationChip } from './annotation-chip.presentational'

/** The chip with its draft held the way the tray holds it. */
function HeldChip(props: ComponentProps<typeof AnnotationChip>) {
  const [editValue, setEditValue] = useState(props.editValue)
  return (
    <AnnotationChip
      {...props}
      editValue={editValue}
      onEditValueChange={(next) => {
        setEditValue(next)
        props.onEditValueChange(next)
      }}
    />
  )
}

const meta = {
  title: 'Features/ResponseAnnotations/AnnotationChip',
  component: AnnotationChip,
  args: {
    annotation: {
      id: 'annotation-1',
      messageId: 'item-assistant',
      quotedText: 'I rewrote the scheduler so retries back off exponentially.',
      prefix: '',
      suffix: '',
      body: 'Why exponential rather than jittered?',
      kind: 'comment',
      state: 'pending',
      createdAt: '2026-10-01T14:03:00.000Z',
    },
    isEditing: false,
    editValue: 'Why exponential rather than jittered?',
    onEditValueChange: fn(),
    onStartEdit: fn(),
    onSubmitEdit: fn(),
    onCancelEdit: fn(),
    onRemove: fn(),
  },
  render: (args) => <HeldChip {...args} />,
} satisfies Meta<typeof AnnotationChip>

export default meta

type Story = StoryObj<typeof meta>

/** A quote and what you said back to it, with edit and remove. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('Why exponential rather than jittered?'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: /^Edit response to/ }),
    )
    await expect(args.onStartEdit).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: /^Remove response to/ }),
    )
    await expect(args.onRemove).toHaveBeenCalledOnce()
  },
}

/** Editing: the field takes focus; Enter saves, Escape discards the draft. */
export const Editing: Story = {
  args: { isEditing: true },
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: /^Edit response to/ })
    await expect(field).toHaveFocus()
    await userEvent.type(field, ' Jitter avoids the herd.')
    await expect(args.onEditValueChange).toHaveBeenLastCalledWith(
      'Why exponential rather than jittered? Jitter avoids the herd.',
    )
    await userEvent.keyboard('{Enter}')
    await expect(args.onSubmitEdit).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    await expect(args.onCancelEdit).toHaveBeenCalledOnce()
  },
}

/** A reaction. */
export const Reaction: Story = {
  args: {
    annotation: {
      id: 'annotation-2',
      messageId: 'item-assistant',
      quotedText: 'The migration runs in a single transaction.',
      prefix: '',
      suffix: '',
      body: '👍',
      kind: 'reaction',
      state: 'pending',
      createdAt: '2026-10-01T14:03:10.000Z',
    },
  },
}

/** A long quote and a long response are both cut short. */
export const Long: Story = {
  args: {
    annotation: {
      id: 'annotation-3',
      messageId: 'item-assistant',
      quotedText:
        'Every popover in the composer now returns focus to the message field when it closes, including the skill picker, the context picker and the three inline injection pickers.',
      prefix: '',
      suffix: '',
      body: 'Does that include closing with a click outside, or only Escape? I lost focus that way twice yesterday.',
      kind: 'comment',
      state: 'pending',
      createdAt: '2026-10-01T14:03:20.000Z',
    },
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const EditingDark: Story = {
  ...Editing,
  name: 'Editing, dark',
  globals: { theme: 'dark' },
}
