import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '#lib/cn.pure'
import { popupMotion } from '../../motion/popup.styles'
import { Kbd } from '../kbd/kbd'
import { tooltipSurface } from './tooltip.styles'
import {
  innermostAt,
  isTruncated,
  mayShow,
  openingOf,
  placeTooltip,
  sideOf,
  type TooltipInstant,
  type TooltipSide,
} from './tooltip-host.pure'

/** What an anchor's attributes say its tooltip is. */
type TooltipText = {
  label: string
  detail: string | null
  shortcut: string | null
}

type Shown = TooltipText & {
  anchor: Element
  side: TooltipSide
  instant: TooltipInstant
}

const textOf = (anchor: Element): TooltipText => ({
  label: anchor.getAttribute('data-tooltip') ?? '',
  detail: anchor.getAttribute('data-tooltip-detail') || null,
  shortcut: anchor.getAttribute('data-tooltip-shortcut') || null,
})

/**
 * One tooltip for the whole page (Flyweight, MAR-3616): a single bubble for
 * every control that has a tooltip. It listens on the document for a pointer
 * resting on, or keyboard focus reaching, anything with `data-tooltip` (what
 * Tooltip and IconButton set) and shows that label beside it. Over a card's
 * stretched action, which every point of the card lands on, it shows what
 * lies under the pointer (MC N1). Once one has shown, the next opens at once. A press or Escape puts it away. The bubble is
 * `app-no-drag`, so it can float over the window's title strip without
 * becoming draggable chrome (MAR-3284), and no call site passes a style for
 * it again.
 *
 * Ported from accent.'s host, imported statically: Electron has no first-load
 * budget to protect, and a lazy chunk would only add an async step to every
 * hover test.
 */
export function TooltipHost() {
  const [shown, setShown] = useState<Shown | null>(null)
  const [open, setOpen] = useState(false)
  const hideRef = useRef(() => {})
  const [onGone] = useState(() => () => hideRef.current())
  // Once the bubble has left, its words go too: nothing of it lingers.
  const [onLeft] = useState(() => () => setShown(null))

  useEffect(() => {
    /** The element whose tooltip shows, or is about to. */
    let current: Element | null = null
    let cause: 'hover' | 'focus' | null = null
    let showing = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let closedAt = Number.NEGATIVE_INFINITY
    /** Pressed: its tooltip stays away until the pointer leaves it. */
    let pressed: Element | null = null
    /**
     * The card's stretched action the pointer is over, when what shows was
     * found under it: leaving the action leaves that too.
     */
    let via: Element | null = null
    /**
     * Whether the keyboard moved last, as `:focus-visible` decides it: a key
     * makes focus visible, a press makes it quiet. Tracked here rather than
     * read from the selector, so jsdom (which matches `:focus-visible` on a
     * focused button but not on a focusable span) and a synthetic click in a
     * story both answer as a person's keyboard and pointer would.
     */
    let keyboard = true

    const hide = () => {
      clearTimeout(timer)
      current = null
      cause = null
      if (!showing) return
      showing = false
      closedAt = performance.now()
      setOpen(false)
    }
    hideRef.current = hide

    const allowed = (anchor: Element) =>
      mayShow({
        label: anchor.getAttribute('data-tooltip'),
        popupOpen:
          anchor.hasAttribute('data-popup-open') ||
          anchor.hasAttribute('data-tooltip-card'),
        expanded: anchor.getAttribute('aria-expanded'),
        hasPopup: anchor.getAttribute('aria-haspopup'),
        onlyWhenTruncated:
          anchor.getAttribute('data-tooltip-when') === 'truncated',
        truncated: isTruncated(anchor),
      })

    /**
     * The tooltip for where an event happened: the closest element with one.
     * A tooltip only for cut-short words, while its words fit, gives way to
     * the one around it (a Badge's words in a row that has a tooltip).
     */
    const ownOf = (target: EventTarget | null): Element | null => {
      let anchor = tooltipTargetOf(target)
      while (
        anchor !== null &&
        anchor.getAttribute('data-tooltip-when') === 'truncated' &&
        !isTruncated(anchor)
      )
        anchor = tooltipTargetOf(anchor.parentElement)
      return anchor
    }

    /**
     * What a pointer rests on. Over a card's stretched action every point of
     * the card lands on the action, so there it is the innermost tooltip
     * drawn under the point that may show (a cut-short line, a meter), and
     * the action's own only where there is none (MC N1).
     */
    const anchorAt = (event: PointerEvent): Element | null => {
      const action = stretchedActionOf(event.target)
      if (!action) return ownOf(event.target)
      const card = action.closest('[data-slot="card"]')
      const under = card
        ? [...card.querySelectorAll('[data-tooltip]')].filter(
            (element) => element !== action,
          )
        : []
      const index = innermostAt(
        { x: event.clientX, y: event.clientY },
        under.map((element) => element.getBoundingClientRect()),
        (at) => allowed(under[at]!),
      )
      return index === null ? ownOf(action) : under[index]!
    }

    const show = (anchor: Element, how: 'hover' | 'focus') => {
      if (!allowed(anchor)) return
      clearTimeout(timer)
      current = anchor
      cause = how
      const { delayMs, instant } = openingOf(how, {
        showing,
        msSinceClosed: performance.now() - closedAt,
      })
      const reveal = () => {
        if (!allowed(anchor)) return
        showing = true
        setShown({
          anchor,
          ...textOf(anchor),
          side: sideOf(anchor.getAttribute('data-tooltip-side')),
          instant,
        })
        setOpen(true)
      }
      if (delayMs === 0) reveal()
      else timer = setTimeout(reveal, delayMs)
    }

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const anchor = anchorAt(event)
      via = stretchedActionOf(event.target)
      if (anchor && anchor !== current && anchor !== pressed)
        show(anchor, 'hover')
    }
    // Under a stretched action the pointer goes from one line to the next
    // without leaving the action, so no pointerover says so: the move does.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const action = stretchedActionOf(event.target)
      if (!action) return
      via = action
      const anchor = anchorAt(event)
      if (anchor === current) return
      if (cause === 'hover') hide()
      if (anchor && anchor !== pressed) show(anchor, 'hover')
    }
    const onPointerOut = (event: PointerEvent) => {
      if (via !== null && event.target === via) {
        if (isInside(via, event.relatedTarget)) return
        via = null
        pressed = null
        if (cause === 'hover') hide()
        return
      }
      const anchor = ownOf(event.target)
      if (!anchor || isInside(anchor, event.relatedTarget)) return
      if (anchor === pressed) pressed = null
      if (anchor === current && cause === 'hover') hide()
    }
    const onFocusIn = (event: FocusEvent) => {
      const anchor = ownOf(event.target)
      // Only focus the keyboard brought shows a tooltip; the focus a press
      // brings stays quiet.
      if (anchor && anchor !== current && anchor !== pressed && keyboard)
        show(anchor, 'focus')
    }
    const onFocusOut = (event: FocusEvent) => {
      const anchor = ownOf(event.target)
      if (
        anchor &&
        anchor === current &&
        cause === 'focus' &&
        !isInside(anchor, event.relatedTarget)
      )
        hide()
    }
    const onPointerDown = (event: PointerEvent) => {
      keyboard = false
      pressed = anchorAt(event)
      hide()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.altKey && !event.ctrlKey) keyboard = true
      if (event.key === 'Escape') hide()
    }

    // Capture, so a component that stops an event's propagation can't strand
    // a tooltip.
    const listeners = [
      ['pointerover', onPointerOver],
      ['pointermove', onPointerMove],
      ['pointerout', onPointerOut],
      ['focusin', onFocusIn],
      ['focusout', onFocusOut],
      ['pointerdown', onPointerDown],
      ['keydown', onKeyDown],
    ] as const
    for (const [type, listener] of listeners) {
      document.addEventListener(type, listener as EventListener, true)
    }
    return () => {
      clearTimeout(timer)
      for (const [type, listener] of listeners) {
        document.removeEventListener(type, listener as EventListener, true)
      }
    }
  }, [])

  return createPortal(
    <TooltipBubble open={open} shown={shown} onGone={onGone} onLeft={onLeft} />,
    document.body,
  )
}

type TooltipBubbleProps = {
  open: boolean
  shown: Shown | null
  /** Its anchor left the page, or lost its label. */
  onGone: () => void
  /** It has finished leaving the screen. */
  onLeft: () => void
}

/**
 * The tooltip on screen. It grows from what it explains and fades, on the
 * same `data-starting-style` and `data-ending-style` frames Base UI's popups
 * use (popupMotion), so closing midway reverses. Opening at once (by focus, or
 * right after another tooltip) skips the animation.
 */
function TooltipBubble({ open, shown, onGone, onLeft }: TooltipBubbleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const text = useLiveText(open ? (shown?.anchor ?? null) : null, shown, onGone)

  // Beside its anchor, and following it while the page scrolls or resizes, or
  // its words change. Placed before it enters, so it travels from its side.
  useLayoutEffect(() => {
    const bubble = ref.current
    if (!bubble || !open || !shown) return
    const place = () => {
      bubble.style.left = '0px'
      bubble.style.top = '0px'
      const placed = placeTooltip(
        shown.anchor.getBoundingClientRect(),
        bubble.getBoundingClientRect(),
        {
          width: document.documentElement.clientWidth,
          height: window.innerHeight,
        },
        shown.side,
      )
      bubble.style.left = `${placed.left}px`
      bubble.style.top = `${placed.top}px`
      bubble.style.setProperty(
        '--transform-origin',
        `${placed.originX}px ${placed.originY}px`,
      )
      bubble.dataset.side = placed.side
    }
    place()
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    window.addEventListener('scroll', follow, { capture: true, passive: true })
    window.addEventListener('resize', follow)
    const resized = new ResizeObserver(follow)
    resized.observe(bubble)
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      window.removeEventListener('scroll', follow, { capture: true })
      window.removeEventListener('resize', follow)
    }
  }, [open, shown, text])

  // Enter and leave. Kept mounted, and hidden once it has left, so the next
  // one can grow in.
  useLayoutEffect(() => {
    const bubble = ref.current
    if (!bubble) return
    if (open) {
      if (bubble.hasAttribute('data-ending-style')) {
        bubble.removeAttribute('data-ending-style')
      } else if (bubble.hidden) {
        bubble.hidden = false
        bubble.setAttribute('data-starting-style', '')
        bubble.getBoundingClientRect()
        bubble.removeAttribute('data-starting-style')
      }
      return
    }
    if (bubble.hidden) return
    bubble.setAttribute('data-ending-style', '')
    let reopened = false
    // jsdom has no Web Animations: nothing to wait for there.
    const running =
      typeof bubble.getAnimations === 'function' ? bubble.getAnimations() : []
    Promise.all(running.map((animation) => animation.finished)).then(
      () => {
        if (reopened) return
        bubble.hidden = true
        bubble.removeAttribute('data-ending-style')
        onLeft()
      },
      () => {},
    )
    return () => {
      reopened = true
    }
  }, [open, onLeft])

  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      hidden
      data-slot="tooltip-content"
      data-instant={shown?.instant}
      className={cn(
        tooltipSurface,
        popupMotion,
        'pointer-events-none fixed whitespace-pre-line app-no-drag data-instant:transition-none',
      )}
    >
      {text.label}
      {text.detail ? (
        <span className="mt-0.5 block text-2xs opacity-70">{text.detail}</span>
      ) : null}
      {text.shortcut ? (
        <Kbd aria-hidden className="ml-1.5">
          {text.shortcut}
        </Kbd>
      ) : null}
    </div>
  )
}

const EMPTY_TEXT: TooltipText = { label: '', detail: null, shortcut: null }

/**
 * The anchor's words as they are now: a toggle pressed from the keyboard
 * changes its label while its tooltip shows ("Pin sidebar" becomes "Unpin
 * sidebar"). Calls onGone when the anchor loses its label or leaves the page.
 * Watches only while open.
 */
function useLiveText(
  anchor: Element | null,
  shown: Shown | null,
  onGone: () => void,
): TooltipText {
  const [live, setLive] = useState<TooltipText>(shown ?? EMPTY_TEXT)
  const [from, setFrom] = useState(shown)
  if (from !== shown) {
    setFrom(shown)
    setLive(shown ?? EMPTY_TEXT)
  }
  useEffect(() => {
    if (!anchor) return
    const words = new MutationObserver(() => {
      const next = textOf(anchor)
      if (next.label) setLive(next)
      else onGone()
    })
    words.observe(anchor, {
      attributes: true,
      attributeFilter: [
        'data-tooltip',
        'data-tooltip-detail',
        'data-tooltip-shortcut',
      ],
    })
    const page = new MutationObserver(() => {
      if (!anchor.isConnected) onGone()
    })
    page.observe(document.body, { childList: true, subtree: true })
    return () => {
      words.disconnect()
      page.disconnect()
    }
  }, [anchor, onGone])
  return live
}

/** The closest element with a tooltip, from where an event happened. */
const tooltipTargetOf = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest('[data-tooltip]') : null

/**
 * A card's stretched action (CardAction), when an event landed on it: its
 * hit area covers the whole card, over everything not raised above it.
 */
const stretchedActionOf = (target: EventTarget | null): Element | null =>
  target instanceof Element &&
  target.getAttribute('data-slot') === 'card-action'
    ? target
    : null

const isInside = (anchor: Element, node: EventTarget | null): boolean =>
  node instanceof Node && anchor.contains(node)
