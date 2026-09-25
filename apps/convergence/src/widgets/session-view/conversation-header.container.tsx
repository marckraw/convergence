import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from 'react'
import { MoreVertical } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useElementWidth } from '@/shared/hooks/use-element-width'
import { cn } from '@/shared/lib/cn.pure'
import {
  headerLayout,
  headerLayoutKey,
  headerYieldPriority,
  identityWidths,
  parseHeaderLayoutKey,
  type HeaderItem,
  type HeaderYieldId,
} from './conversation-header.pure'
import {
  useTranscriptViewMode,
  useTranscriptViewStore,
} from './transcript-view.model'

/**
 * The window drags by the header's empty space, and never by a control (R7).
 * The data attribute states the same fact where jsdom drops the style.
 */
export const HEADER_DRAG_REGION = {
  style: { WebkitAppRegion: 'drag' } as CSSProperties,
  'data-app-region': 'drag',
} as const
export const HEADER_NO_DRAG_REGION = {
  style: { WebkitAppRegion: 'no-drag' } as CSSProperties,
  'data-app-region': 'no-drag',
} as const

/** What More lists for a control that has yielded (R4). */
export type HeaderMenuEntry =
  /** The control's own action, under the control's own name. */
  | {
      kind: 'action'
      key: string
      label: string
      /** A toggle's state, read out as a checkbox item. */
      checked?: boolean
      onSelect: () => void
    }
  /**
   * The control is itself a menu or popover: the entry opens that one, from
   * the control's own trigger, under the name that trigger carries.
   */
  | { kind: 'opens'; key: string; opens: 'menu' | 'popover' }
  /**
   * A reading with no action (the agent meter): a focusable item that reads
   * out `name: label` and leaves More open when chosen.
   */
  | { kind: 'text'; key: string; name: string; label: string }

export interface HeaderSlot {
  /** A control's id is its place in `HEADER_YIELD_ORDER`. */
  id: string
  side: 'left' | 'right'
  /** Status and Stop are pinned; only a control may yield. */
  group: 'status' | 'control' | 'stop'
  node: ReactNode
  entries?: HeaderMenuEntry[]
}

interface ConversationHeaderProps {
  /** Null for a conversation with no project: no project part is drawn. */
  projectName: string | null
  conversationName: string
  /** Drawn before the project name, with its width (the chat icon). */
  leading?: { node: ReactNode; width: number }
  /** Everything but the identity and More, in the order they are drawn. */
  slots: HeaderSlot[]
  /**
   * More's own entries. Null when the header has none: More then appears
   * only to hold what yielded.
   */
  moreContent: ReactNode | null
}

const MORE_WIDTH = 28

interface Measured {
  items: Record<string, number>
  project: number
  name: number
}

const EMPTY_MEASURED: Measured = { items: {}, project: 0, name: 0 }

/**
 * A name's natural width, read with the min-width this layout applied to it
 * lifted for the read: `scrollWidth` never reads below a box's min-width, so
 * measuring the laid-out span would feed the reserve back to itself and a
 * shorter name would never give it up (MAR-3427 B).
 */
function naturalWidth(span: HTMLElement | null): number {
  if (!span) return 0
  const applied = span.style.minWidth
  span.style.minWidth = '0px'
  const width = span.scrollWidth
  span.style.minWidth = applied
  return width
}

/**
 * Where focus goes for a header control that may have yielded (MAR-3427 D).
 * A yielded control is hidden and inert, so focusing it lands nowhere; its
 * place is taken by More, which is where it can be reached. A control that is
 * drawn (or never sat in a header) is its own target.
 */
export function headerFocusTarget(
  element: HTMLElement | null,
): HTMLElement | null {
  if (!element?.closest('[data-header-item][data-yielded]')) return element
  return (
    element
      .closest('[data-conversation-header]')
      ?.querySelector<HTMLElement>('[data-header-more]') ?? null
  )
}

function sameMeasured(left: Measured, right: Measured): boolean {
  if (left.project !== right.project || left.name !== right.name) return false
  const keys = Object.keys(left.items)
  if (keys.length !== Object.keys(right.items).length) return false
  return keys.every((key) => left.items[key] === right.items[key])
}

/** The trigger a yielded menu or popover control opens from. */
function triggerOf(header: HTMLElement | null, id: string) {
  return (
    header
      ?.querySelector(`[data-header-inner="${id}"]`)
      ?.querySelector('button') ?? null
  )
}

/** A trigger's own name, as the control reads it out. */
function triggerName(trigger: HTMLButtonElement): string {
  return (
    trigger.getAttribute('aria-label') ||
    trigger.textContent?.trim() ||
    trigger.title ||
    ''
  )
}

/**
 * The conversation header: identity, live status, a named Stop and More, with
 * every other control yielding into More in one fixed order as the header
 * narrows (MAR-3427 CH3).
 *
 * Composite + Strategy: the session and chat headers hand over their controls
 * as slots, and `headerLayout` alone decides which are drawn and on how many
 * rows. A yielded control stays mounted where it was -- hidden, inert, and
 * parked over More -- so a menu keeps its state and opens from More exactly
 * as it opens from the header.
 */
export const ConversationHeader: FC<ConversationHeaderProps> = ({
  projectName,
  conversationName,
  leading,
  slots,
  moreContent,
}) => {
  const headerRef = useRef<HTMLDivElement>(null)
  const projectRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const pendingOpen = useRef<{ id: string; opens: 'menu' | 'popover' } | null>(
    null,
  )
  const [measured, setMeasured] = useState<Measured>(EMPTY_MEASURED)
  const [triggers, setTriggers] = useState<
    Record<string, { name: string; disabled: boolean }>
  >({})

  // Natural widths. A control's inner box never shrinks, yielded or not, so
  // what is measured never depends on the layout it feeds. Reads happen when
  // the drawn set changes or a name changes (layout effects) and when a drawn
  // box resizes (the observer, after layout) -- never on every render, which
  // would force a reflow per streamed token.
  const lastMeasured = useRef<Measured>(EMPTY_MEASURED)
  const measure = useRef<() => void>(() => {})
  measure.current = () => {
    const header = headerRef.current
    if (!header) return
    const items: Record<string, number> = {}
    for (const inner of header.querySelectorAll<HTMLElement>(
      '[data-header-inner]',
    ))
      items[inner.dataset.headerInner!] = Math.ceil(
        inner.getBoundingClientRect().width,
      )
    const next: Measured = {
      items,
      project: naturalWidth(projectRef.current),
      name: naturalWidth(nameRef.current),
    }
    if (sameMeasured(lastMeasured.current, next)) return
    lastMeasured.current = next
    setMeasured(next)
  }
  const observer = useRef<ResizeObserver | null>(null)
  const observed = useRef(new Set<Element>())
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    const current = new Set(header.querySelectorAll('[data-header-inner]'))
    let changed = current.size !== observed.current.size
    if (typeof ResizeObserver === 'function')
      observer.current ??= new ResizeObserver(() => measure.current())
    for (const element of current)
      if (!observed.current.has(element)) {
        changed = true
        observed.current.add(element)
        observer.current?.observe(element)
      }
    for (const element of [...observed.current])
      if (!current.has(element)) {
        observed.current.delete(element)
        observer.current?.unobserve(element)
      }
    if (changed) measure.current()
  })
  useLayoutEffect(() => {
    measure.current()
  }, [projectName, conversationName])
  useLayoutEffect(
    () => () => {
      observer.current?.disconnect()
      observer.current = null
      observed.current.clear()
    },
    [],
  )

  const identity = identityWidths({
    projectNatural: projectName === null ? null : measured.project,
    nameNatural: measured.name,
    leading: leading?.width,
  })
  const items: HeaderItem[] = [
    {
      id: 'identity',
      width: identity.width,
      minWidth: identity.minWidth,
      priority: 0,
      pinned: true,
      group: 'identity',
    },
    ...[...slots]
      .sort((left, right) =>
        left.side === right.side ? 0 : left.side === 'left' ? -1 : 1,
      )
      .map(
        (slot): HeaderItem => ({
          id: slot.id,
          width: measured.items[slot.id] ?? 0,
          priority:
            slot.group === 'control'
              ? headerYieldPriority(slot.id as HeaderYieldId)
              : 0,
          pinned: slot.group !== 'control',
          group: slot.group,
        }),
      ),
    {
      id: 'more',
      width: MORE_WIDTH,
      priority: 0,
      pinned: true,
      group: 'more',
      onlyWithOverflow: moreContent === null,
    },
  ]
  // The header measures itself, never the window, and redraws only when what
  // it draws changes (R3).
  const layoutKey = useElementWidth(headerRef, (width) =>
    headerLayoutKey(headerLayout({ width, items })),
  )
  const layout = useMemo(() => parseHeaderLayoutKey(layoutKey), [layoutKey])
  const overflow = new Set(layout.overflow)
  const visible = new Set(layout.visible)
  const statusRows = layout.rows.slice(1)
  const onStatusRow = new Set(statusRows.flat())

  const openYielded = (id: string, opens: 'menu' | 'popover') => {
    const trigger = triggerOf(headerRef.current, id)
    if (!trigger) return
    // The trigger is inert while yielded, so the menu's own focus return
    // lands nowhere; hand focus back to More when it closes. One task later,
    // after the menu's own return has run, and only if focus is lost (on the
    // body, or on a yielded control): a click elsewhere keeps its focus.
    let opened = false
    const watch = new MutationObserver(() => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true'
      if (expanded) opened = true
      else if (opened) {
        watch.disconnect()
        window.setTimeout(() => {
          const active = document.activeElement
          const lost =
            !active ||
            active === document.body ||
            active.closest('[data-yielded]') !== null
          if (lost && moreRef.current?.isConnected) moreRef.current.focus()
        }, 0)
      }
    })
    watch.observe(trigger, {
      attributes: true,
      attributeFilter: ['aria-expanded'],
    })
    window.setTimeout(() => {
      if (!opened) watch.disconnect()
    }, 1000)
    trigger.dispatchEvent(
      opens === 'menu'
        ? new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            bubbles: true,
            cancelable: true,
          })
        : new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
  }

  const readTriggers = () => {
    const next: Record<string, { name: string; disabled: boolean }> = {}
    for (const slot of slots) {
      if (!overflow.has(slot.id)) continue
      const trigger = triggerOf(headerRef.current, slot.id)
      if (trigger)
        next[slot.id] = {
          name: triggerName(trigger),
          disabled: trigger.disabled,
        }
    }
    setTriggers(next)
  }

  const renderSlot = (slot: HeaderSlot) => {
    const yielded = overflow.has(slot.id)
    return (
      <div
        key={slot.id}
        data-header-item={slot.id}
        data-yielded={yielded || undefined}
        aria-hidden={yielded || undefined}
        inert={yielded}
        className={
          yielded
            ? 'pointer-events-none absolute right-4 top-2.5 h-7 w-7 overflow-hidden opacity-0'
            : 'contents'
        }
      >
        <div
          data-header-inner={slot.id}
          className={cn(
            'flex shrink-0 items-center empty:hidden',
            yielded && 'absolute right-0 top-0',
          )}
          // A control never drags the window, on whichever row it sits; the
          // status row's own empty space still does (R7).
          {...HEADER_NO_DRAG_REGION}
        >
          {slot.node}
        </div>
      </div>
    )
  }
  const inRow1 = (slot: HeaderSlot) => !onStatusRow.has(slot.id)

  const identityLabel =
    projectName === null
      ? conversationName
      : `${conversationName}, in ${projectName}`
  const identityTitle =
    projectName === null
      ? conversationName
      : `${projectName} / ${conversationName}`

  const yieldedEntries = slots
    .filter((slot) => overflow.has(slot.id))
    .flatMap((slot) => (slot.entries ?? []).map((entry) => ({ slot, entry })))

  return (
    <div
      ref={headerRef}
      data-conversation-header
      data-header-rows={layout.rows.length}
      className="relative flex shrink-0 flex-col border-b border-border px-4"
      {...HEADER_DRAG_REGION}
    >
      <div className="flex h-12 items-center gap-1.5">
        <div
          className="flex min-w-0 items-center gap-1.5"
          {...HEADER_NO_DRAG_REGION}
        >
          <div
            role="group"
            aria-label={identityLabel}
            title={identityTitle}
            data-header-identity
            className="flex min-w-0 shrink items-center gap-1.5 text-sm"
            style={{ minWidth: identity.minWidth }}
          >
            {leading?.node}
            {projectName !== null && (
              <>
                <span
                  ref={projectRef}
                  data-header-project
                  className="min-w-0 shrink-[999] truncate text-muted-foreground"
                  style={{ minWidth: identity.projectMin }}
                >
                  {projectName}
                </span>
                <span
                  aria-hidden
                  className="w-2 shrink-0 text-center text-muted-foreground/60"
                >
                  /
                </span>
              </>
            )}
            <span
              ref={nameRef}
              data-header-name
              className="min-w-0 shrink truncate font-medium"
              style={{ minWidth: identity.nameMin }}
            >
              {conversationName}
            </span>
          </div>
          {slots
            .filter((slot) => slot.side === 'left' && inRow1(slot))
            .map(renderSlot)}
        </div>
        <div
          className="ml-auto flex shrink-0 items-center gap-1.5"
          {...HEADER_NO_DRAG_REGION}
        >
          {slots
            .filter((slot) => slot.side === 'right' && inRow1(slot))
            .map(renderSlot)}
          {visible.has('more') && (
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) readTriggers()
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  ref={moreRef}
                  data-header-more
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="More actions"
                  aria-label="Session actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  const pending = pendingOpen.current
                  if (!pending) return
                  pendingOpen.current = null
                  event.preventDefault()
                  openYielded(pending.id, pending.opens)
                }}
              >
                {yieldedEntries.map(({ slot, entry }) =>
                  entry.kind === 'action' ? (
                    <DropdownMenuItem
                      key={entry.key}
                      data-yielded-entry={slot.id}
                      // A toggle reads out its state; a plain action keeps
                      // Radix's own menuitem role.
                      {...(entry.checked === undefined
                        ? {}
                        : {
                            role: 'menuitemcheckbox',
                            'aria-checked': entry.checked,
                          })}
                      onSelect={entry.onSelect}
                    >
                      {entry.label}
                    </DropdownMenuItem>
                  ) : entry.kind === 'opens' ? (
                    <DropdownMenuItem
                      key={entry.key}
                      data-yielded-entry={slot.id}
                      disabled={triggers[slot.id]?.disabled}
                      onSelect={() => {
                        pendingOpen.current = {
                          id: slot.id,
                          opens: entry.opens,
                        }
                      }}
                    >
                      {triggers[slot.id]?.name ?? slot.id}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      key={entry.key}
                      data-yielded-entry={slot.id}
                      aria-label={`${entry.name}: ${entry.label}`}
                      className="text-xs tabular-nums text-muted-foreground"
                      // A reading: choosing it keeps More open.
                      onSelect={(event) => event.preventDefault()}
                    >
                      {entry.label}
                    </DropdownMenuItem>
                  ),
                )}
                {yieldedEntries.length > 0 && moreContent !== null && (
                  <DropdownMenuSeparator />
                )}
                {moreContent}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {statusRows.map((row, index) => (
        <div
          key={index}
          data-header-status-row
          className="flex h-8 items-center gap-1.5 pb-1"
        >
          {slots.filter((slot) => row.includes(slot.id)).map(renderSlot)}
        </div>
      ))}
    </div>
  )
}

/**
 * The Compact/Full switch as More entries, bound to the same remembered
 * choice the switch writes (MAR-3391 R5).
 */
export function useConversationViewEntries(
  sessionId: string,
): HeaderMenuEntry[] {
  const mode = useTranscriptViewMode(sessionId)
  const setMode = useTranscriptViewStore((state) => state.setMode)
  return [
    {
      kind: 'action',
      key: 'view-compact',
      label: 'Compact',
      checked: mode === 'compact',
      onSelect: () => setMode(sessionId, 'compact'),
    },
    {
      kind: 'action',
      key: 'view-full',
      label: 'Full',
      checked: mode === 'full',
      onSelect: () => setMode(sessionId, 'full'),
    },
  ]
}
