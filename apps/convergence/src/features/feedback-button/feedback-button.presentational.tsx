import {
  FLOATING_CORNER_BUTTON_CLASS,
  type FeedbackPriority,
} from '@/entities/feedback'
import { MessageSquarePlus } from 'lucide-react'
import {
  cn,
  Field,
  FieldLabel,
  Fieldset,
  FieldsetLegend,
  FormDialog,
  IconButton,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Textarea,
} from '@convergence/ui'

interface FeedbackButtonProps {
  open: boolean
  priority: FeedbackPriority
  title: string
  description: string
  contact: string
  error: string | null
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onPriorityChange: (priority: FeedbackPriority) => void
  onTitleChange: (title: string) => void
  onDescriptionChange: (description: string) => void
  onContactChange: (contact: string) => void
  onSubmit: () => void
  /** The key that also sends it, in words ("⌘↵"), for Send's tooltip. */
  submitShortcut?: string
}

const priorities: Array<{
  value: FeedbackPriority
  label: string
}> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/**
 * The floating corner button over the app's glass, drawn from tokens alone:
 * the strong hairline, the raised surface, the floating shadow.
 */
const floatingButtonClass =
  'z-40 rounded-full border border-hairline-strong bg-raised/90 text-ink shadow-floating backdrop-blur-xl hover:border-ink/35 hover:bg-highlight'

/**
 * Send feedback: the button in the window's corner and the form it opens,
 * both under the one name (NAV-28). Nothing is kept until Send, so the form
 * ends in Cancel and Send (R6).
 */
export function FeedbackButton({
  open,
  priority,
  title,
  description,
  contact,
  error,
  submitting,
  onOpenChange,
  onPriorityChange,
  onTitleChange,
  onDescriptionChange,
  onContactChange,
  onSubmit,
  submitShortcut,
}: FeedbackButtonProps) {
  const missing =
    title.trim().length < 3
      ? 'Add a title of three letters or more'
      : description.trim().length < 5
        ? 'Say a little more in the description'
        : undefined

  return (
    <>
      <IconButton
        label="Send feedback"
        tooltipSide="left"
        type="button"
        variant="primary"
        size="lg"
        onClick={() => onOpenChange(true)}
        className={cn(FLOATING_CORNER_BUTTON_CLASS, floatingButtonClass)}
      >
        {/* Lucide's own stroke, as every glyph (NAV-6). */}
        <MessageSquarePlus className="h-5 w-5" />
      </IconButton>

      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Send feedback"
        description="Ask for a feature, or say what should change in Convergence."
        size="md"
        saves="on-save"
        onSave={onSubmit}
        saveShortcut={submitShortcut}
        saveLabel="Send"
        pendingLabel="Sending…"
        pending={submitting}
        saveDisabledReason={missing}
        error={error}
      >
        <div className="flex flex-col gap-4">
          <Field className="gap-2">
            <FieldLabel>Title</FieldLabel>
            <Input
              size="lg"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Add export to Markdown"
              required
              minLength={3}
              autoComplete="off"
            />
          </Field>

          <Fieldset className="flex flex-col gap-2">
            <FieldsetLegend>Priority</FieldsetLegend>
            <SegmentedControl
              aria-label="Priority"
              value={priority}
              onValueChange={(value) =>
                onPriorityChange(value as FeedbackPriority)
              }
              className="flex w-full"
            >
              {priorities.map((item) => (
                <SegmentedControlItem
                  key={item.value}
                  value={item.value}
                  className="flex-1"
                >
                  {item.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </Fieldset>

          <Field className="gap-2">
            <FieldLabel>Description</FieldLabel>
            <Textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="I want to export notes directly to Markdown files."
              required
              minLength={5}
              rows={7}
              className="max-h-72 min-h-36 resize-none"
            />
          </Field>

          <Field className="gap-2">
            <FieldLabel>Contact (optional)</FieldLabel>
            <Input
              size="lg"
              value={contact}
              onChange={(event) => onContactChange(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
        </div>
      </FormDialog>
    </>
  )
}
