import { useRender } from '@base-ui/react/use-render'
import { createContext, useContext } from 'react'
import { cn } from '#lib/cn.pure'
import { toneLine, toneSoft, type Tone } from '#lib/tone.styles'

/**
 * Where a card sits, by how much it stands off its background. `inset` is the
 * app's most common card, the panel's faint wash (bg-surface/30, 19 of 79 fills);
 * `raised` is the full surface (bg-surface, 13); `dashed` holds a place for
 * something that isn't there yet.
 */
const SURFACES = {
  inset: 'border-line bg-surface/30',
  raised: 'border-line bg-surface',
  dashed: 'border-dashed border-line bg-transparent',
} as const

type CardSurface = keyof typeof SURFACES

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
} as const

type CardPadding = keyof typeof PADDINGS

const CardContext = createContext({ selected: false })

type CardProps = Omit<useRender.ComponentProps<'div'>, 'className'> & {
  className?: string
  surface?: CardSurface
  /** p-3 (sm, the default) or p-4 (md); `none` for a card that lays out its own edges. */
  padding?: CardPadding
  /** A card that says something about a state, like a request waiting on you (R1). */
  tone?: Tone
  /**
   * It opens something: one CardAction inside it covers the whole card, so the
   * card is one tab stop, answers the pointer anywhere, and rings as a whole.
   */
  interactive?: boolean
  /** The chosen one of its list (R7): the selected fill, and aria-current on its action. */
  selected?: boolean
}

/**
 * A box that groups what belongs together (MAR-3616): rounded-lg (42 of 67
 * cards), a hairline, a surface. A `<div>`, or what `render` says. It sets no
 * layout of its own: what's inside lays itself out.
 *
 * An interactive card is a stretched link: put one CardAction (a button or a
 * link) inside it, usually its title. Its hit area covers the card and draws
 * the focus ring round the card's edge, so a card never wraps a link in a
 * `role="button"` (MC-26). Other controls inside it sit above that area
 * (`relative`), so they stay their own tab stops.
 */
function Card({
  surface = 'inset',
  padding = 'sm',
  tone,
  interactive = false,
  selected = false,
  render,
  className,
  ...props
}: CardProps) {
  const element = useRender({
    defaultTagName: 'div',
    render,
    props: {
      ...props,
      'data-slot': 'card',
      'data-surface': surface,
      'data-selected': selected ? '' : undefined,
      // A card with no action of its own carries its selection itself.
      'aria-current': selected && !interactive ? 'true' : undefined,
      className: cn(
        'rounded-lg border text-ink',
        SURFACES[surface],
        PADDINGS[padding],
        tone !== undefined && [toneLine[tone], toneSoft[tone]],
        interactive && 'relative transition-colors',
        interactive && !selected && 'hover:bg-fill-hover',
        selected && 'bg-fill-selected',
        className,
      ),
    },
  })
  return (
    <CardContext.Provider value={{ selected }}>{element}</CardContext.Provider>
  )
}

/**
 * The focus ring of a stretched action, drawn by its hit area round the whole
 * card: focusRing's recipe (MAR-3588: the style named with the width), on the
 * ::after that covers the card instead of on the words.
 */
const stretchedFocusRing = [
  'outline-none',
  'focus-visible:after:outline-solid',
  'focus-visible:after:outline-(length:--focus-width)',
  'focus-visible:after:outline-focus',
].join(' ')

type CardActionProps = Omit<useRender.ComponentProps<'button'>, 'className'> & {
  className?: string
}

/**
 * What an interactive card does, usually its title: a `<button>`, or a link
 * with `render={<a href />}` (a router Link too). Its hit area stretches over
 * the whole card.
 */
function CardAction({ render, className, ...props }: CardActionProps) {
  const { selected } = useContext(CardContext)
  return useRender({
    defaultTagName: 'button',
    render,
    props: {
      ...(render === undefined ? { type: 'button' as const } : {}),
      ...props,
      'data-slot': 'card-action',
      'aria-current': selected ? 'true' : undefined,
      className: cn(
        'app-no-drag text-left after:absolute after:inset-0 after:rounded-lg',
        stretchedFocusRing,
        className,
      ),
    },
  })
}

export {
  Card,
  CardAction,
  type CardActionProps,
  type CardPadding,
  type CardProps,
  type CardSurface,
}
