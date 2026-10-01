import { Loader2 } from 'lucide-react'
import { cn } from '#lib/cn.pure'

/** The spinner's glyph, by size: 12, 14 and 16 px. */
const SIZES = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-4',
} as const

type SpinnerSize = keyof typeof SIZES

type SpinnerProps = {
  /** 12, 14 or 16 px; md (16), the most common today, unless told otherwise. */
  size?: SpinnerSize
  /**
   * What is under way, for a spinner shown alone: it becomes a status that
   * says so to a screen reader. Without one the spinner is decoration, as it
   * is inside Button's `pending`, beside words that already say it.
   */
  label?: string
  className?: string
}

/**
 * Something under way with no progress to show (MAR-3616): an open circle
 * turning at an even speed, in the text's color, for as long as it's shown.
 * Plain CSS, so it's there from the first frame. Reduced motion stands it
 * still; the open circle still reads as busy.
 */
function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const glyph = (
    <Loader2
      aria-hidden
      data-slot="spinner"
      data-size={size}
      className={cn(
        SIZES[size],
        'shrink-0 animate-spin motion-reduce:animate-none',
        className,
      )}
    />
  )
  if (!label) return glyph
  return (
    <span role="status" className="inline-flex items-center">
      {glyph}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export { Spinner, type SpinnerProps, type SpinnerSize }
