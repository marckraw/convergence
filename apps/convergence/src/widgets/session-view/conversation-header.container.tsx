import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import { MoreVertical, Pin } from 'lucide-react'
import {
  cn,
  IconButton,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  type PopupFinalFocus,
  type PopupOpenChangeDetails,
  ScreenHeader,
  tooltipAttributes,
} from '@convergence/ui'
import { useElementWidth } from '@/shared/hooks/use-element-width'
import {
  headerLayout,
  headerLayoutKey,
  headerYieldPriority,
  identityStyles,
  identityWidths,
  interactionKeepsFocusWhereItIs,
  parseHeaderLayoutKey,
  type HeaderItem,
  type HeaderYieldId,
} from './conversation-header.pure'

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
   * The control is itself a menu: the entry opens that one, through the
   * menu's own controlled `open` (MAR-3429 CH4), under the name its trigger
   * carries.
   */
  | { kind: 'opens'; key: string; onOpen: () => void }
  /**
   * A reading with no action (the agent meter): a focusable item that reads
   * out `name: label` and leaves More open when chosen.
   */
  | { kind: 'text'; key: string; name: string; label: string }

/**
 * How a header control that opens a popup (a Menu or a Popover) hands the
 * focus on when it closes (MAR-3427 A, MAR-3616): provider-neutral, in the
 * popup parts' own words. `finalFocus` goes on the popup's content and runs
 * once it has gone, its exit animation included: it gives the focus to More
 * while the control is yielded. `onOpenChange` is called from the popup
 * root's own, so the header hears why it closed: a right-click outside
 * leaves the focus where it is.
 */
export interface HeaderMenuFocus {
  finalFocus: PopupFinalFocus
  onOpenChange: (open: boolean, details: PopupOpenChangeDetails) => void
}

export interface HeaderSlot {
  /** A control's id is its place in `HEADER_YIELD_ORDER`. */
  id: string
  side: 'left' | 'right'
  /** Status and Stop are pinned; only a control may yield. */
  group: 'status' | 'control' | 'stop'
  /**
   * A control that opens a menu takes the focus props for its content
   * (MAR-3427 A).
   */
  node: ReactNode | ((focus: HeaderMenuFocus) => ReactNode)
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
  /**
   * The conversation is pinned: a small mark beside its name says so, where
   * a button used to (MAR-3429 CH4 R5).
   */
  pinned?: boolean
  /**
   * What is docked beside the header right now, named (the PR panel, docked
   * Parallel work). A dock opening or closing moves the header's width in its
   * own commit; when this changes the width is read again in that commit, so
   * a focus decided right after it (a closed panel handing focus back to its
   * group) sees the groups drawn at the header's real width (MAR-3429 CH4
   * lap 2 A).
   */
  docked?: string
}

const MORE_WIDTH = 28
/** The pin mark (`h-3 w-3`) and the gap before it (`gap-1.5`). */
const PIN_MARK_WIDTH = 18

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

type TriggerReadings = Record<string, { name: string; disabled: boolean }>

/** What More needs of each yielded menu trigger, read as it is now (D). */
function readTriggers(
  header: HTMLElement | null,
  ids: readonly string[],
): TriggerReadings {
  const readings: TriggerReadings = {}
  for (const id of ids) {
    const trigger = triggerOf(header, id)
    if (trigger)
      readings[id] = { name: triggerName(trigger), disabled: trigger.disabled }
  }
  return readings
}

function sameReadings(left: TriggerReadings, right: TriggerReadings): boolean {
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every(
    (key) =>
      left[key].name === right[key]?.name &&
      left[key].disabled === right[key]?.disabled,
  )
}

function sameMeasured(left: Measured, right: Measured): boolean {
  if (left.project !== right.project || left.name !== right.name) return false
  const keys = Object.keys(left.items)
  if (keys.length !== Object.keys(right.items).length) return false
  return keys.every((key) => left.items[key] === right.items[key])
}

/** The trigger a yielded menu control opens from. */
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
 * as it opens from the header: through its own controlled `open`, anchored
 * where More is (MAR-3429 CH4).
 */
export const ConversationHeader: FC<ConversationHeaderProps> = ({
  projectName,
  conversationName,
  leading,
  slots,
  moreContent,
  pinned = false,
  docked = '',
}) => {
  const headerRef = useRef<HTMLElement>(null)
  const projectRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  /** The yielded menu More opens once its own content has gone. */
  const pendingOpen = useRef<(() => void) | null>(null)
  const [measured, setMeasured] = useState<Measured>(EMPTY_MEASURED)
  const [triggers, setTriggers] = useState<TriggerReadings>({})
  const [moreOpen, setMoreOpen] = useState(false)
  /** Yielded menus touched from outside while open (MAR-3427 A). */
  const interactedOutside = useRef(new Set<string>())

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

  const trailing = pinned ? PIN_MARK_WIDTH : 0
  const identity = identityWidths({
    projectNatural: projectName === null ? null : measured.project,
    nameNatural: measured.name,
    leading: leading?.width,
    trailing,
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
  // it draws changes (R3). No control is pinned by an open panel any more
  // (MAR-3429 CH4), but a docked panel still moves the header's width in the
  // commit that opens or closes it: `docked` has the width read again then,
  // not a frame later when the observer fires (lap 2 A).
  const layoutKey = useElementWidth(
    headerRef,
    (width) => headerLayoutKey(headerLayout({ width, items })),
    docked,
  )
  const layout = useMemo(() => parseHeaderLayoutKey(layoutKey), [layoutKey])
  const overflow = new Set(layout.overflow)
  const visible = new Set(layout.visible)
  const statusRows = layout.rows.slice(1)
  const onStatusRow = new Set(statusRows.flat())

  const isYielded = (id: string) =>
    headerRef.current?.querySelector(
      `[data-header-item="${id}"][data-yielded]`,
    ) != null

  /**
   * A yielded menu's trigger is inert, so the menu's own focus return lands
   * nowhere. Once it has closed -- after the exit animation, once the content
   * has unmounted -- More takes the trigger's place. A right-click outside
   * leaves the focus where it is, yielded or not (MAR-3427 A).
   */
  const menuFocus = (id: string): HeaderMenuFocus => ({
    onOpenChange: (open, details) => {
      if (!open && interactionKeepsFocusWhereItIs(details))
        interactedOutside.current.add(id)
    },
    finalFocus: () => {
      const outside = interactedOutside.current.delete(id)
      if (outside) return false
      if (!isYielded(id)) return true
      return moreRef.current ?? false
    },
  })

  const renderSlot = (slot: HeaderSlot) => {
    const yielded = overflow.has(slot.id)
    const node =
      typeof slot.node === 'function'
        ? slot.node(menuFocus(slot.id))
        : slot.node
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
          // A control never drags the window, on whichever row it sits; the
          // status row's own empty space still does (R7).
          className={cn(
            'app-no-drag flex shrink-0 items-center empty:hidden',
            yielded && 'absolute right-0 top-0',
          )}
        >
          {node}
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

  const identityStyle = identityStyles(identity, {
    projectNatural: projectName === null ? null : measured.project,
    leading: leading?.width,
    trailing,
  })

  // More reads its yielded menus' names and disabled states as they are now,
  // not as they were when it opened: after every render (a control yielding
  // while More is open), and while it is open, whenever a trigger changes on
  // its own (MAR-3427 D).
  const yieldedMenuIds = slots
    .filter(
      (slot) =>
        overflow.has(slot.id) &&
        slot.entries?.some((entry) => entry.kind === 'opens'),
    )
    .map((slot) => slot.id)
  const yieldedMenuKey = yieldedMenuIds.join(' ')
  const syncTriggers = useRef<() => void>(() => {})
  syncTriggers.current = () => {
    const next = readTriggers(headerRef.current, yieldedMenuIds)
    setTriggers((previous) => (sameReadings(previous, next) ? previous : next))
  }
  useLayoutEffect(() => {
    syncTriggers.current()
  })
  // More is drawn only while it has something to hold (the chat header's):
  // when it goes, it goes closed, so it never comes back open (MAR-3429 CH4
  // R9).
  const moreShown = visible.has('more')
  useLayoutEffect(() => {
    if (!moreShown) setMoreOpen(false)
  }, [moreShown])
  useEffect(() => {
    const header = headerRef.current
    if (!moreOpen || !header || typeof MutationObserver !== 'function') return
    const watch = new MutationObserver(() => syncTriggers.current())
    watch.observe(header, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-label', 'title'],
    })
    return () => watch.disconnect()
  }, [moreOpen, yieldedMenuKey])

  // Focus never stays inside a control that has yielded: it is hidden and
  // inert there, and the browser drops it to the page. More, where the
  // control now lives, takes it (MAR-3427 C: Parallel work unpinning as its
  // panel closes).
  useLayoutEffect(() => {
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      headerRef.current?.contains(active) &&
      active.closest('[data-header-item][data-yielded]') &&
      moreRef.current?.isConnected
    )
      moreRef.current.focus()
  })

  const yieldedEntries = slots
    .filter((slot) => overflow.has(slot.id))
    .flatMap((slot) => (slot.entries ?? []).map((entry) => ({ slot, entry })))

  // The screen's top strip (NAV-4): ScreenHeader draws it and owns the drag,
  // so the window moves by the header's empty space and never by a control
  // (R7). The 48 px row is laid out here, because its controls yield to More
  // as it narrows; each group in it is `app-no-drag`.
  return (
    <ScreenHeader
      ref={headerRef}
      data-conversation-header
      data-header-rows={layout.rows.length}
      className="relative"
      bar={
        <>
          <div className="app-no-drag flex min-w-0 items-center gap-1.5">
            <div
              role="group"
              aria-label={identityLabel}
              {...tooltipAttributes(identityTitle)}
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
                    className="truncate text-ink-muted"
                    style={identityStyle.project ?? undefined}
                  >
                    {projectName}
                  </span>
                  <span
                    aria-hidden
                    className="w-2 shrink-0 text-center text-ink-muted/60"
                  >
                    /
                  </span>
                </>
              )}
              <span
                ref={nameRef}
                data-header-name
                className="truncate font-medium"
                style={identityStyle.name}
              >
                {conversationName}
              </span>
              {pinned && (
                <Pin
                  role="img"
                  aria-label="Pinned"
                  data-header-pin-mark
                  className="h-3 w-3 shrink-0 fill-current text-strong"
                />
              )}
            </div>
            {slots
              .filter((slot) => slot.side === 'left' && inRow1(slot))
              .map(renderSlot)}
          </div>
          <div className="app-no-drag ml-auto flex shrink-0 items-center gap-1.5">
            {slots
              .filter((slot) => slot.side === 'right' && inRow1(slot))
              .map(renderSlot)}
            {moreShown && (
              <Menu open={moreOpen} onOpenChange={(open) => setMoreOpen(open)}>
                <MenuTrigger
                  render={
                    <IconButton
                      ref={moreRef}
                      data-header-more
                      label="Session actions"
                      variant="ghost"
                      size="sm"
                    />
                  }
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </MenuTrigger>
                <MenuContent
                  align="end"
                  // A yielded menu chosen here opens once More has gone, and
                  // takes the focus itself (MAR-3429 CH4).
                  finalFocus={() => {
                    const open = pendingOpen.current
                    if (!open) return true
                    pendingOpen.current = null
                    open()
                    return false
                  }}
                >
                  {yieldedEntries.map(({ slot, entry }) =>
                    entry.kind === 'action' ? (
                      entry.checked === undefined ? (
                        <MenuItem
                          key={entry.key}
                          data-yielded-entry={slot.id}
                          onClick={entry.onSelect}
                        >
                          {entry.label}
                        </MenuItem>
                      ) : (
                        // A toggle reads out its state.
                        <MenuCheckboxItem
                          key={entry.key}
                          data-yielded-entry={slot.id}
                          checked={entry.checked}
                          onCheckedChange={entry.onSelect}
                          closeOnClick
                        >
                          {entry.label}
                        </MenuCheckboxItem>
                      )
                    ) : entry.kind === 'opens' ? (
                      <MenuItem
                        key={entry.key}
                        data-yielded-entry={slot.id}
                        disabled={triggers[slot.id]?.disabled ?? true}
                        onClick={() => {
                          pendingOpen.current = entry.onOpen
                        }}
                      >
                        {triggers[slot.id]?.name}
                      </MenuItem>
                    ) : (
                      <MenuItem
                        key={entry.key}
                        data-yielded-entry={slot.id}
                        aria-label={`${entry.name}: ${entry.label}`}
                        className="text-xs tabular-nums text-ink-muted"
                        // A reading: choosing it keeps More open.
                        closeOnClick={false}
                      >
                        {entry.label}
                      </MenuItem>
                    ),
                  )}
                  {yieldedEntries.length > 0 && moreContent !== null && (
                    <MenuSeparator />
                  )}
                  {moreContent}
                </MenuContent>
              </Menu>
            )}
          </div>
        </>
      }
    >
      {statusRows.map((row, index) => (
        <div
          key={index}
          data-header-status-row
          className="flex h-8 items-center gap-1.5 pb-1"
        >
          {slots.filter((slot) => row.includes(slot.id)).map(renderSlot)}
        </div>
      ))}
    </ScreenHeader>
  )
}
