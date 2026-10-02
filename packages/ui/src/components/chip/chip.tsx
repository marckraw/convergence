import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { toneInk, toneLine, toneSoft, type Tone } from '#lib/tone.styles'
import { IconButton } from '../icon-button/icon-button'

type ChipProps = Omit<ComponentProps<'span'>, 'className' | 'children'> & {
  className?: string
  /** The item's name: a file, a skill, a project's context. Cut short past 192 px. */
  children: ReactNode
  /** A 14 px glyph before the name, decorative: a file's kind, a skill's book. */
  icon?: ReactNode
  /** A tone (R1), for an item that says something: one that failed to attach is danger. */
  tone?: Tone
  /** The item is missing (a file moved away): a dashed edge on a fainter wash. */
  dashed?: boolean
} & ChipRemoval

/** A removable chip names its ✕ for what it removes; a fixed one has neither. */
type ChipRemoval =
  | {
      /** Takes the item off: a 24 px IconButton ✕ at its end. */
      onRemove: () => void
      /** The ✕'s name and tooltip, which say what it removes: "Remove plan.pdf". */
      removeLabel: string
    }
  | { onRemove?: undefined; removeLabel?: undefined }

/**
 * Something attached to the next message (MAR-3616): a file, a skill, a
 * project's context, an annotation, six chip shapes today, one part now
 * (CONV-15). The attachment chip's look, kept (R0): rounded-md, a hairline,
 * the muted wash and ink, in the 12 px print; 28 px tall, so its 24 px ✕
 * (an IconButton, the smallest control, R3) fits inside it. Removing it is
 * the ✕, named and tooltipped for what it removes; the chip promises no
 * Delete key (CONV-16).
 */
function Chip({
  children,
  icon,
  tone,
  dashed = false,
  onRemove,
  removeLabel,
  className,
  ...props
}: ChipProps) {
  return (
    <span
      data-slot="chip"
      data-tone={tone}
      data-missing={dashed ? '' : undefined}
      className={cn(
        'inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-md border pl-1.5 text-xs',
        onRemove ? 'pr-0.5' : 'pr-1.5',
        tone === undefined
          ? 'border-line bg-surface-muted/40 text-ink-muted'
          : [toneLine[tone], toneSoft[tone], toneInk[tone]],
        dashed && 'border-dashed bg-surface-muted/20',
        className,
      )}
      {...props}
    >
      {icon == null ? null : (
        <span aria-hidden className="flex shrink-0 [&_svg]:size-3.5">
          {icon}
        </span>
      )}
      {/* The cut keeps a focus ring's width of room round the name, so a
          name that is a control (a file's preview) shows its ring whole. */}
      <span className="-m-(--focus-width) max-w-48 min-w-0 truncate p-(--focus-width)">
        {children}
      </span>
      {onRemove ? (
        <IconButton
          label={removeLabel}
          size="xs"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <X aria-hidden className="size-3" />
        </IconButton>
      ) : null}
    </span>
  )
}

export { Chip, type ChipProps }
