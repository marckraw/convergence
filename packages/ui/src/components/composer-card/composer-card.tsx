import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'

export type ComposerCardProps = Omit<ComponentProps<'div'>, 'className'> & {
  /** Its place: a depth over what sits beneath it, never a new look. */
  className?: string
  /**
   * A file is being dragged over it: its edge turns dashed and strong, so it
   * reads as the place the file lands.
   */
  dragging?: boolean
}

/**
 * The card a message is written in (CONV-17): the composer's, and the fork
 * dialog's seed editor, which is the same card trimmed. rounded-xl, the
 * surface, a hairline and 12 px round what it holds. Dragged over, the
 * hairline turns dashed and strong.
 *
 * The field inside is a bare Textarea that grows (`variant="bare"`,
 * `autoGrow`, `maxRows`): the card is what reads as the field, so the card
 * has the edge and the field has none. Drop handlers go on the card, or on
 * whatever holds it and more (the composer's card and the strip under it are
 * one drop target).
 */
export function ComposerCard({
  dragging = false,
  className,
  ...props
}: ComposerCardProps) {
  return (
    <div
      {...props}
      data-slot="composer-card"
      data-dragging={dragging ? '' : undefined}
      className={cn(
        'rounded-xl border bg-surface p-3 transition-colors',
        dragging ? 'border-strong border-dashed' : 'border-line',
        className,
      )}
    />
  )
}
