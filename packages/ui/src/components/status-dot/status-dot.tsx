import { cn } from '#lib/cn.pure'
import { toneSolid, type Tone } from '#lib/tone.styles'

/** Today's three dots, kept: 6, 8 and 10 px. */
const SIZES = {
  sm: 'size-1.5',
  md: 'size-2',
  lg: 'size-2.5',
} as const

type StatusDotSize = keyof typeof SIZES

/**
 * A hollow dot: the tone's solid as a ring with nothing inside. Written out
 * whole, so Tailwind finds each class here.
 */
const RINGS: Record<Tone, string> = {
  neutral: 'border border-neutral-solid',
  info: 'border border-info-solid',
  success: 'border border-success-solid',
  warning: 'border border-warning-solid',
  danger: 'border border-danger-solid',
}

type StatusDotProps = {
  /** What the state says (R1). */
  tone?: Tone
  /** 6, 8 or 10 px; md (8) unless told otherwise. */
  size?: StatusDotSize
  /** It beats while something is under way. Reduced motion stands it still. */
  pulse?: boolean
  /**
   * An empty ring in the tone: what should be there isn't (a seat with no
   * card), where the filled dot says it is.
   */
  hollow?: boolean
  /**
   * The state in words, for a screen reader, when no word beside the dot says
   * it already. Without one the dot is decoration (R1: never colour alone).
   */
  label?: string
  className?: string
}

/**
 * A state as a dot in the tone's solid colour (MAR-3616): a session working,
 * a tunnel running, a hop landed. It may beat (`pulse`) while something is
 * under way, on the tokens' 2 s blink, which stands still under reduced
 * motion. A dot never stands alone: give it a `label`, or put the word beside
 * it.
 */
function StatusDot({
  tone = 'neutral',
  size = 'md',
  pulse = false,
  hollow = false,
  label,
  className,
}: StatusDotProps) {
  const dot = (
    <span
      aria-hidden
      data-slot="status-dot"
      data-tone={tone}
      data-size={size}
      data-pulse={pulse ? '' : undefined}
      data-hollow={hollow ? '' : undefined}
      className={cn(
        'inline-block shrink-0 rounded-full',
        SIZES[size],
        hollow ? RINGS[tone] : toneSolid[tone],
        pulse && 'animate-pulse motion-reduce:animate-none',
        className,
      )}
    />
  )
  if (!label) return dot
  return (
    <span className="inline-flex items-center">
      {dot}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export { StatusDot, type StatusDotProps, type StatusDotSize }
