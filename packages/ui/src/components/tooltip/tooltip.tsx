import {
  cloneElement,
  createContext,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useContext,
} from 'react'
import { TooltipHost } from './tooltip-host'
import type { TooltipSide } from './tooltip-host.pure'

/** The attributes that give an element its tooltip; the TooltipProvider reads them. */
type TooltipAttributes = {
  'data-tooltip'?: string
  'data-tooltip-side'?: TooltipSide
  'data-tooltip-detail'?: string
  'data-tooltip-shortcut'?: string
  'data-tooltip-when'?: 'truncated'
}

type TooltipOptions = {
  /** Where it shows; above unless told otherwise or that doesn't fit. */
  side?: TooltipSide
  /** A second, muted line under the label. */
  detail?: string
  /** A key to press for the same thing, already formatted ("⌘,"): a Kbd beside the label. */
  shortcut?: string
  /** `truncated`: only while the element's text is cut short (R2). */
  when?: 'always' | 'truncated'
}

/**
 * An element's tooltip, as attributes. An empty or missing label gives no
 * tooltip at all, so `label={busy ? reason : undefined}` reads naturally.
 */
const tooltipAttributes = (
  label: string | undefined,
  { side, detail, shortcut, when }: TooltipOptions = {},
): TooltipAttributes => {
  if (!label) return {}
  return {
    'data-tooltip': label,
    ...(side ? { 'data-tooltip-side': side } : {}),
    ...(detail ? { 'data-tooltip-detail': detail } : {}),
    ...(shortcut ? { 'data-tooltip-shortcut': shortcut } : {}),
    ...(when === 'truncated' ? { 'data-tooltip-when': 'truncated' } : {}),
  }
}

/** Whether a TooltipProvider is already above: a nested one leaves the tooltips to it. */
const ProvidedContext = createContext(false)

type TooltipProviderProps = {
  children: ReactNode
}

/**
 * Shows every tooltip on the page (MAR-3616), so they share one delay
 * (200 ms) and one look: once one has shown, the next opens at once. The app
 * mounts one at its root through UiProvider; a provider under another leaves
 * the work to the outer one, so a test or a story that brings its own still
 * gets one tooltip.
 */
function TooltipProvider({ children }: TooltipProviderProps) {
  if (useContext(ProvidedContext)) return children
  return (
    <ProvidedContext value={true}>
      {children}
      <TooltipHost />
    </ProvidedContext>
  )
}

type TooltipProps = TooltipOptions & {
  /**
   * What the tooltip says: a few words, or a name cut short. Plain text only;
   * a richer body is a TooltipCard. Empty means no tooltip.
   */
  label: string | undefined
  /** What it explains: one element, which passes data-* props on to its DOM element. */
  children: ReactElement<TooltipAttributes>
}

/**
 * Our one tooltip (MAR-3616, R2): a short label shown when a pointer rests on
 * its element or keyboard focus reaches it. It adds nothing to the page but
 * data attributes; the TooltipProvider at the root shows it. An icon-only
 * button uses IconButton instead, whose label is both its accessible name and
 * its tooltip. Never a native `title`.
 */
function Tooltip({
  label,
  side,
  detail,
  shortcut,
  when,
  children,
  ...passed
}: TooltipProps) {
  return cloneElement(children, {
    ...mergeIntoChild(
      passed as Record<string, unknown>,
      children.props as Record<string, unknown>,
    ),
    ...tooltipAttributes(label, { side, detail, shortcut, when }),
  })
}

/**
 * What a trigger hands a Tooltip on its way to the element (a Radix
 * `asChild` trigger around a Tooltip passes its handlers, its ref and its
 * aria-expanded through it): merged into the element's own, as a slot
 * would, so neither side's handler or ref is lost.
 */
function mergeIntoChild(
  passed: Record<string, unknown>,
  own: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...passed }
  for (const [key, value] of Object.entries(passed)) {
    const mine = own[key]
    if (
      /^on[A-Z]/.test(key) &&
      typeof value === 'function' &&
      typeof mine === 'function'
    ) {
      merged[key] = (...args: unknown[]) => {
        const result = (mine as (...a: unknown[]) => unknown)(...args)
        ;(value as (...a: unknown[]) => unknown)(...args)
        return result
      }
    } else if (key === 'ref' && mine) {
      merged.ref = composeRefs(value as Ref<unknown>, mine as Ref<unknown>)
    } else if (key === 'className' && typeof mine === 'string') {
      merged.className = [value, mine].filter(Boolean).join(' ')
    } else if (key === 'style' && mine && typeof mine === 'object') {
      merged.style = { ...(value as object), ...(mine as object) }
    }
  }
  return merged
}

const composeRefs =
  <T,>(...refs: Ref<T>[]) =>
  (node: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as RefObject<T | null>).current = node
    }
  }

export {
  Tooltip,
  type TooltipAttributes,
  type TooltipOptions,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
  type TooltipSide,
  tooltipAttributes,
}
