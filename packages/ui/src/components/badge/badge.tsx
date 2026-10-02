import { cva } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { toneInk, toneLine, toneSoft, type Tone } from '#lib/tone.styles'

/**
 * R1's named categories: things told apart by hue, not by state. A tag hue
 * (a Space's status, a skill's origin), a merge, a crew's colour, a provider's
 * tint. Which thing wears which hue lives in the owning entity's .pure.ts.
 */
const HUES = {
  merged: 'border-merged/25 bg-merged/10 text-merged-ink',
  'tag-cyan': 'border-tag-cyan/25 bg-tag-cyan/10 text-tag-cyan-ink',
  'tag-sky': 'border-tag-sky/25 bg-tag-sky/10 text-tag-sky-ink',
  'tag-green': 'border-tag-green/25 bg-tag-green/10 text-tag-green-ink',
  'tag-emerald': 'border-tag-emerald/25 bg-tag-emerald/10 text-tag-emerald-ink',
  'tag-lime': 'border-tag-lime/25 bg-tag-lime/10 text-tag-lime-ink',
  'tag-teal': 'border-tag-teal/25 bg-tag-teal/10 text-tag-teal-ink',
  'tag-violet': 'border-tag-violet/25 bg-tag-violet/10 text-tag-violet-ink',
  'tag-indigo': 'border-tag-indigo/25 bg-tag-indigo/10 text-tag-indigo-ink',
  'tag-rose': 'border-tag-rose/25 bg-tag-rose/10 text-tag-rose-ink',
  'tag-orange': 'border-tag-orange/25 bg-tag-orange/10 text-tag-orange-ink',
  'tag-yellow': 'border-tag-yellow/25 bg-tag-yellow/10 text-tag-yellow-ink',
  'tag-zinc': 'border-tag-zinc/25 bg-tag-zinc/10 text-tag-zinc-ink',
  // A crew's colour and a provider's tint are swatches with no ink of their
  // own: their edge and wash carry the hue, the word stays in the body ink.
  'crew-violet': 'border-crew-violet/40 bg-crew-violet/10 text-ink',
  'crew-blue': 'border-crew-blue/40 bg-crew-blue/10 text-ink',
  'crew-cyan': 'border-crew-cyan/40 bg-crew-cyan/10 text-ink',
  'crew-green': 'border-crew-green/40 bg-crew-green/10 text-ink',
  'crew-amber': 'border-crew-amber/40 bg-crew-amber/10 text-ink',
  'crew-red': 'border-crew-red/40 bg-crew-red/10 text-ink',
  'crew-pink': 'border-crew-pink/40 bg-crew-pink/10 text-ink',
  'crew-slate': 'border-crew-slate/40 bg-crew-slate/10 text-ink',
  'provider-openai': 'border-provider-openai/40 bg-provider-openai/10 text-ink',
  'provider-anthropic':
    'border-provider-anthropic/40 bg-provider-anthropic/10 text-ink',
  'provider-pi': 'border-provider-pi/40 bg-provider-pi/10 text-ink',
  'provider-cursor': 'border-provider-cursor/40 bg-provider-cursor/10 text-ink',
  'provider-google': 'border-provider-google/40 bg-provider-google/10 text-ink',
} as const

type BadgeHue = keyof typeof HUES

type BadgeShape = 'pill' | 'label' | 'count'

type BadgeSize = 'sm' | 'md'

const badgeVariants = cva(
  [
    'inline-flex h-5 max-w-full items-center gap-1 border align-middle whitespace-nowrap',
    '[&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0',
  ],
  {
    variants: {
      /**
       * Its words, in R4's two small steps, in the same 20 px box: 10 px
       * (`sm`, the default), or 11 px (`md`) where it sits among 11 px words,
       * as the composer's strip states its machine (MAR-2642). A size is a
       * prop, never a className (R3, DS-4).
       */
      size: {
        sm: 'text-3xs leading-3xs',
        // No leading of its own: the strip's line, as its className left it (R0).
        md: 'text-2xs',
      },
      /**
       * A pill is a state or a fact (Draft, Local); a label names a kind in a
       * smaller box (Provider); a count is a number, its figures one width.
       */
      shape: {
        pill: 'min-w-0 rounded-full px-2',
        label: 'min-w-0 rounded-sm px-1.5 font-medium',
        count:
          'min-w-5 shrink-0 justify-center rounded-full px-1.5 tabular-nums',
      },
    },
    defaultVariants: { shape: 'pill', size: 'sm' },
  },
)

/** A tone's tint, edge and ink. */
const toneClasses = (tone: Tone) =>
  cn(toneSoft[tone], toneLine[tone], toneInk[tone])

/**
 * The composer's count, in the strong ink on its own faint wash: a count says
 * how many, not how it's going, so it has no edge and no state colour.
 */
const neutralCount = 'border-transparent bg-strong/15 text-strong'

type BadgeProps = Omit<ComponentProps<'span'>, 'className'> & {
  className?: string
  /** What it says about the thing (R1). A tone never stands alone: its word says it too. */
  tone?: Tone
  /** A category told apart by hue instead of a state; wins over `tone`. */
  hue?: BadgeHue
  shape?: BadgeShape
  /** 10 px words (`sm`, the default), or 11 px (`md`) among 11 px words; always 20 px tall. */
  size?: BadgeSize
  /** A 12 px glyph before the word, decorative: the word says it. */
  icon?: ReactNode
  /**
   * Its word in capitals, as a kind or a short state reads in a list of them
   * (LOCAL, DISABLED): the look 19 badges typed as a className (DLG).
   */
  caps?: boolean
  /**
   * The tone's edge and ink with no wash, for a badge on paper that is
   * already tinted, where a wash would sink its words under 4.5:1 (Loom's
   * cards); a quiet tag that labels rather than says a state (a diff's file
   * status). A hue keeps its wash.
   */
  outline?: boolean
}

/**
 * A small word on a tint: a state, a kind, a count (MAR-3616). One height,
 * 20 px, in the 10 px step (R4), whatever it says, so badges side by side line
 * up; a long word is cut short rather than widening its row. Its default is
 * the app's most copied chip (14 times): a full round pill on the muted wash
 * with the soft line, in the muted ink.
 */
function Badge({
  tone = 'neutral',
  hue,
  shape = 'pill',
  size = 'sm',
  icon,
  caps = false,
  outline = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const colours =
    hue !== undefined
      ? HUES[hue]
      : outline
        ? cn(toneLine[tone], toneInk[tone])
        : shape === 'count' && tone === 'neutral'
          ? neutralCount
          : toneClasses(tone)
  return (
    <span
      data-slot="badge"
      data-tone={hue === undefined ? tone : undefined}
      data-hue={hue}
      data-shape={shape}
      data-size={size}
      data-outline={outline && hue === undefined ? '' : undefined}
      className={cn(
        badgeVariants({ shape, size }),
        colours,
        caps && 'uppercase',
        className,
      )}
      {...props}
    >
      {icon == null ? null : (
        <span aria-hidden="true" className="flex shrink-0">
          {icon}
        </span>
      )}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

export {
  Badge,
  type BadgeHue,
  type BadgeProps,
  type BadgeShape,
  type BadgeSize,
}
