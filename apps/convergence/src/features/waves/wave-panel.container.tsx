import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type UIEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { SessionSummary } from '@/entities/session'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { loadWavePanelMode, saveWavePanelMode } from './wave-panel-mode.api'
import { loadWavePanelWidth, saveWavePanelWidth } from './wave-panel-width.api'
import type { WavePanelMode } from './wave-panel-mode.pure'
import { loadLoomSheet, saveLoomSheet } from './wave-panel-sheet.api'
import type { LoomSheet } from './wave-panel-sheet.pure'
import { loomSubline } from './loom-sheets.pure'
import { loomCrewHasChoice } from './wave-panel-crew.pure'
import { loomIssueDetail } from './loom-detail.pure'
import { rowBelongsToSeat } from './loom-horses.pure'
import { LoomCompactView } from './loom-compact.presentational'
import { LoomExpandedView } from './loom-expanded.presentational'
import { LoomStripView } from './loom-strip.presentational'
import { LearnLoomGuide } from './learn-loom.container'
import { WaveResizeHandle } from './wave-resize-handle.presentational'
import { waveRowKey } from './wave-sections.pure'
import {
  clampWavePanelWidth,
  effectiveWavePanelMode,
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
  WAVE_PANEL_MIN_COLUMN_WIDTH,
} from './wave-sections.pure'
import {
  LOOM_ENTER_CLASS,
  LOOM_ENTER_MS,
  LOOM_NO_DRAG_STYLE,
  LOOM_SHELL_CLASS,
  LOOM_SLIDE_MS,
  LOOM_STRIP_WIDTH_PX,
} from './wave-panel.styles'
import { useWaveColumnResize } from './use-wave-column-resize'
import { useWaveBoard } from './use-wave-board'
import { LoomRefresh } from './loom-refresh.container'
import { LoomOutside } from './loom-outside.container'
import { useLoomOutside } from './use-loom-outside'
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value'
import {
  LOOM_SEARCH_DEBOUNCE_MS,
  loomSearchNowhereLine,
  loomSearchSummary,
  normalizeLoomQuery,
} from './loom-search.pure'

interface WavePanelProps {
  onOpenSession?: (session: SessionSummary) => void
  /** Pixels already taken beside the column (the sidebar), for the floor. */
  reservedWidth?: number
  /**
   * Loom is expanded (MAR-3189 R5), so the layout can give it the content
   * area. Reported rather than decided here: the panel knows the mode, only
   * the layout knows what the content area was showing.
   */
  onExpandedChange?: (expanded: boolean) => void
  /**
   * Where the expanded stack is drawn (MAR-3189 R5): the content area itself.
   *
   * A portal rather than a move, and that is load-bearing. Rendering the same
   * component under a different parent REMOUNTS it, and a remount would drop
   * every sheet's scroll offset -- the one thing R3 promises survives a fold.
   * Portalled, the panel keeps its place in the React tree while its stack
   * lands in the DOM the layout asks for.
   */
  expandedContainer?: Element | null
}

/**
 * In Loom a row always opens (MAR-3195 lap 2, A).
 *
 * `WaveRowView` decides whether it is a button from `inertReason` -- a fact
 * about the seat's CONVERSATION. Passing the real reason here made every
 * Plan row, and every row whose conversation is not loaded, an inert `div`:
 * exactly the issues a person most wants to read, unreadable, with the
 * refusal words the detail composes reachable only through a horse card.
 *
 * The refusal did not disappear; it moved inside the detail, which is where
 * it belongs now that a row's door is the ISSUE. (The Waves tab kept the real
 * reason until MAR-3233 retired it; the prop stays in the sheet's contract.)
 */
const LOOM_ROWS_ALWAYS_OPEN = () => null

/**
 * How to find again the control that opened a detail (MAR-3195 R5).
 *
 * A selector rather than the element: the rows are unmounted while the
 * detail has the body, so the node that was clicked is detached by the time
 * the card closes, and focusing it would put the keyboard nowhere.
 *
 * The Details button carries its OWN attribute (lap 2, E). Remembering
 * `[data-loom-horse="…"] button` sent focus to the card's first button --
 * *Open conversation* -- so Escape then Enter left the board entirely.
 */
function openerSelector(active: HTMLElement): string | null {
  const details = active.closest('[data-loom-horse-details]')
  if (details) {
    return `[data-loom-horse-details="${details.getAttribute('data-loom-horse-details')}"]`
  }
  const row = active.closest('[data-wave-row]')
  return row ? `[data-wave-row="${row.getAttribute('data-wave-row')}"]` : null
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

/**
 * Where each sheet was left (MAR-3189 R3).
 *
 * A ref and not state: restoring a scroll position must not redraw anything,
 * and the number changes on every wheel tick. It lives for as long as the app
 * does -- the sheet ITSELF is remembered between runs, but a scroll offset
 * into rows that have since changed is not a promise worth keeping.
 */
function useSheetScroll(
  sheet: LoomSheet,
  frozen: { current: boolean },
  crewId: string | null,
) {
  const offsets = useRef<Record<LoomSheet, number>>({
    before: 0,
    now: 0,
    next: 0,
    plan: 0,
  })
  // Keyed on the open sheet, so React tears the old body down and hands us the
  // new one -- which is exactly when the offset has to go back on.
  const element = useRef<HTMLDivElement | null>(null)
  /**
   * Another crew is another list (MAR-3225 R4): every sheet starts at the top
   * for it, and the offsets a person left in one crew's rows are not applied
   * to a different crew's. Layout time, so the new rows are never painted at
   * the old crew's offset. The sheet's body does NOT remount on a switch --
   * it is keyed on the sheet -- so the element is reset here, not by `bodyRef`.
   */
  const shownCrew = useRef(crewId)
  useLayoutEffect(() => {
    if (shownCrew.current === crewId) return
    shownCrew.current = crewId
    offsets.current = { before: 0, now: 0, next: 0, plan: 0 }
    if (element.current) element.current.scrollTop = 0
  }, [crewId])
  const bodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node
      if (node) node.scrollTop = offsets.current[sheet]
    },
    [sheet],
  )
  /**
   * Put the sheet back where it was (MAR-3195 lap 2, B).
   *
   * Needed as its own act because the scroll container does NOT unmount
   * when a detail takes the body -- only its children swap -- so `bodyRef`
   * is never called again and nothing would restore the offset.
   */
  const restore = useCallback(() => {
    if (element.current) element.current.scrollTop = offsets.current[sheet]
  }, [sheet])
  const onBodyScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      // Frozen while a detail is open (MAR-3195 lap 2, B). The scroll
      // container does NOT unmount when the card takes the body, and a
      // detail shorter than the list clamps `scrollTop` to 0 -- Chromium
      // fires that as a scroll, and writing it here would destroy the place
      // a person was reading from, for this sheet, for good.
      if (frozen.current) return
      offsets.current[sheet] = event.currentTarget.scrollTop
    },
    [sheet, frozen],
  )
  return { bodyRef, onBodyScroll, restore }
}

/**
 * Loom beside the conversation (MAR-3097, MAR-3189). Mounted only when a
 * crew reads a tracker. Four sheets, one open, compact in its column or
 * expanded across the content area -- and the strip, without touching any
 * choice, when the window is too narrow for a column. Never writes to the
 * tracker.
 */
export const WavePanel: FC<WavePanelProps> = ({
  onOpenSession,
  reservedWidth = 0,
  onExpandedChange,
  expandedContainer,
}) => {
  /**
   * Loom's search (MAR-3234): the field's text, immediate, and the query the
   * sheets are filtered by -- a debounced copy of it (R10), so typing costs
   * one derivation when the typing stops, not one per key. An empty field
   * applies at once: a clear is never a wait.
   *
   * Never persisted (R8): it lives exactly as long as this panel does, and a
   * crew switch or the strip empties it.
   */
  const [searchText, setSearchText] = useState('')
  const [appliedText, applySearch] = useDebouncedValue(
    searchText,
    LOOM_SEARCH_DEBOUNCE_MS,
    { immediate: normalizeLoomQuery(searchText) === null },
  )
  const query = normalizeLoomQuery(appliedText)
  const board = useWaveBoard(query)
  // Another crew is another Loom (R8): its search starts empty. Adjusted
  // during render, not in an effect, so no frame ever filters the new crew's
  // rows by the old crew's query.
  const [searchCrew, setSearchCrew] = useState(board.selectedCrewId)
  if (searchCrew !== board.selectedCrewId) {
    setSearchCrew(board.selectedCrewId)
    setSearchText('')
  }
  // One read of the crew's issues outside the loop (MAR-3236), for Plan's
  // group AND the search's summary -- never two subscriptions to one fact.
  const outsideSnapshot = useLoomOutside(board.selectedCrewId)
  /**
   * Compact's field row (R7): drawn once the icon or `/` asks for it, and
   * for as long as the field holds a query whatever else happens.
   */
  const [searchAsked, setSearchAsked] = useState(false)
  const searchRevealed = searchAsked || searchText !== ''
  const searchInput = useRef<HTMLInputElement | null>(null)
  const searchInputRef = useCallback((element: HTMLInputElement | null) => {
    searchInput.current = element
  }, [])
  // Focus is asked for, then given once the field is in the document: in
  // compact the icon's press is what DRAWS the field, a render later.
  const [searchFocusAsk, setSearchFocusAsk] = useState(0)
  useEffect(() => {
    if (searchFocusAsk > 0) searchInput.current?.focus()
  }, [searchFocusAsk])
  const focusSearch = useCallback(() => {
    setSearchAsked(true)
    setSearchFocusAsk((count) => count + 1)
  }, [])
  const clearSearch = useCallback(() => setSearchText(''), [])
  const [stored, setStored] = useState<WavePanelMode>(loadWavePanelMode)
  const [storedWidth, setStoredWidth] = useState<number>(loadWavePanelWidth)
  const [sheet, setSheet] = useState<LoomSheet>(loadLoomSheet)
  /**
   * Whether Awaiting QA is revealed (MAR-3191 R5).
   *
   * Here and not in the sheet, because the sheet's body is unmounted every
   * time a person opens another sheet or folds Loom -- a reveal held down
   * there would quietly close itself, which is the kind of small lie this
   * panel exists not to tell.
   */
  const [qaExpanded, setQaExpanded] = useState(false)
  /**
   * The issue read in place (MAR-3195 R1): its KEY, never the row.
   *
   * A copy of the entry would be a second, ageing truth: the tracker moves
   * every minute, and a detail opened five minutes ago would go on saying
   * what was true then. The key is re-found in the live rows on every
   * render, so the card follows the ledger -- and a row that leaves the
   * ledger takes its detail with it.
   */
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const windowWidth = useWindowWidth()
  const changeMode = useCallback((next: WavePanelMode) => {
    setStored(next)
    saveWavePanelMode(next)
  }, [])
  const selectSheet = useCallback((next: LoomSheet) => {
    setSheet(next)
    saveLoomSheet(next)
    // Reading an issue is about the sheet it was opened from (R5).
    setDetailKey(null)
  }, [])
  /**
   * A finished gesture, and only a finished gesture, becomes the preference
   * (MAR-3155 R2, lap 2 A/C, lap 3 A).
   *
   * What arrives here is what the person MEANT: a drag or a step that moved
   * the column brings the width they ended on; one the window refused, and
   * a drag or a step over a column that is no longer on screen, brings
   * nothing; a reset brings the default. The clamp is the storage's own
   * [MIN, MAX], never the window's, and the round is done once here -- so
   * **the state and the store hold one number**, which is the preference,
   * while the number on screen is the decision's and may be smaller.
   */
  const commitWidth = useCallback((next: number) => {
    const chosen = Math.round(
      clampWavePanelWidth(next, WAVE_PANEL_MAX_COLUMN_WIDTH),
    )
    setStoredWidth(chosen)
    saveWavePanelWidth(chosen)
  }, [])
  /**
   * Every row Loom can show, flat, for the detail's key lookup (R1).
   *
   * All five groups, because a detail stays open while its issue moves --
   * from Now to Before when it is accepted, say -- and a lookup that only
   * searched the sheet it was opened from would close the card under a
   * person's hands at the moment the thing they were reading changed.
   */
  //
  // The UNSEARCHED sheets (MAR-3234): a detail is the issue a person is
  // reading, and typing into the search must not close it under them -- nor
  // throw their focus back to a row that is no longer drawn.
  const allRows = useMemo(
    () => [
      ...board.allSheets.before,
      ...board.allSheets.now.inFlight,
      ...board.allSheets.now.awaitingQa,
      ...board.allSheets.now.fablesTurn,
      ...board.allSheets.now.decide,
      ...board.allSheets.next,
      ...board.allSheets.plan,
    ],
    [board.allSheets],
  )
  const detailRow = useMemo(
    () =>
      detailKey === null
        ? null
        : (allRows.find((row) => waveRowKey(row.entry) === detailKey) ?? null),
    [allRows, detailKey],
  )
  /**
   * The horse this row belongs to (lap 2, D), by the same identity rule the
   * cards claim rows with -- the ledger's join for a resident, the seat name
   * for a recipe. A `crewId + seat` fallback was the name collision MAR-3191
   * lap 2 removed, put back by the back door.
   */
  const detailHorse = useMemo(() => {
    if (!detailRow) return null
    return (
      board.horses.find((horse) =>
        rowBelongsToSeat(
          detailRow,
          { sessionId: horse.sessionId, batonName: horse.seat },
          horse.crewId,
        ),
      ) ?? null
    )
  }, [board.horses, detailRow])

  /**
   * Where focus was when the detail opened, so closing gives it back (R5).
   *
   * The element itself, caught at the click: a selector would have to guess
   * which of the two doors -- a row or a card's Details button -- was used,
   * and guessing wrong puts the keyboard somewhere nobody asked for.
   */
  const openedFrom = useRef<string | null>(null)
  const showDetail = useCallback((entry: WorkLedgerEntry) => {
    // The SELECTOR, not the element: the rows are unmounted while the detail
    // has the body, so the node that was clicked is detached by the time the
    // card closes and focusing it would put the keyboard nowhere.
    const active = document.activeElement
    openedFrom.current =
      active instanceof HTMLElement ? openerSelector(active) : null
    setDetailKey(waveRowKey(entry))
  }, [])
  const closeDetail = useCallback(() => setDetailKey(null), [])
  // Focus returns once the rows are back on screen (R5), which is a render
  // later than the click that closed the card.
  // A row that leaves the ledger takes its key with it (lap 2, C). Left
  // behind, the key goes on claiming Escape -- in expanded the first press
  // would silently do nothing -- and the detail would re-open by itself the
  // day that identifier came back.
  useEffect(() => {
    if (detailKey !== null && detailRow === null) setDetailKey(null)
  }, [detailKey, detailRow])
  const hadDetail = useRef(detailKey !== null)
  useEffect(() => {
    if (hadDetail.current && detailKey === null && openedFrom.current) {
      const target = document.querySelector(openedFrom.current)
      if (target instanceof HTMLElement) target.focus()
      openedFrom.current = null
    }
    hadDetail.current = detailKey !== null
  }, [detailKey])
  const closeButton = useCallback((element: HTMLButtonElement | null) => {
    element?.focus()
  }, [])

  /**
   * A card opens the conversation the CREW RECORD names (MAR-3191 R6).
   *
   * By the member's own `sessionId`, never by looking its baton name up in
   * the session list: two crews may name a seat the same, and a name lookup
   * would open the other crew's conversation with no way for a person to
   * tell. The panel opens and never sends.
   */
  const openSeat = useCallback(
    (sessionId: string) => {
      const session = board.findSession(sessionId)
      if (session) onOpenSession?.(session)
    },
    [board, onOpenSession],
  )
  // The detail freezes the sheet's memory while it is open; the ref is read
  // inside the scroll handler, so it must be the same object across renders.
  //
  // So does a search (MAR-3234 R3): a filtered sheet is shorter than the
  // list, Chromium clamps `scrollTop` and fires that as a scroll -- and
  // recording it would lose the place a clear promises to give back.
  const scrollFrozen = useRef(false)
  scrollFrozen.current = detailKey !== null || query !== null
  const { bodyRef, onBodyScroll, restore } = useSheetScroll(
    sheet,
    scrollFrozen,
    board.selectedCrewId,
  )
  const hadDetailForScroll = useRef(detailKey !== null)
  // The rows are back in the DOM by layout time, so the offset goes on
  // before the browser paints -- a person never sees the list at the top.
  useLayoutEffect(() => {
    if (hadDetailForScroll.current && detailKey === null) restore()
    hadDetailForScroll.current = detailKey !== null
  }, [detailKey, restore])
  // A clear gives the sheet back where it was (R3), the same way a closed
  // detail does -- the body is not remounted, so nothing else would.
  const searched = query !== null
  const wasSearched = useRef(searched)
  useLayoutEffect(() => {
    if (wasSearched.current && !searched) restore()
    wasSearched.current = searched
  }, [searched, restore])
  // The draft is asked for before the early returns below, because hooks are
  // not optional; it is only READ when a column is on screen.
  const [draftWidth, setDraftWidth] = useState<number | null>(null)
  const decision = effectiveWavePanelMode({
    stored,
    storedWidth: draftWidth ?? storedWidth,
    windowWidth,
    reservedWidth,
  })
  /**
   * Whether this window would give a column at all (MAR-3292 R3).
   *
   * The strip has two reasons to be on screen and they can both be true at
   * once, so the question its ways out ask is not "was this chosen" -- it is
   * "is there a column to go back to". Asked of the one function that owns
   * the arithmetic, with `compact` stored, rather than re-derived here: a
   * second copy of that sum is exactly the shape MAR-3155 R6 exists to
   * prevent. Answering the other question instead would send a folded person
   * in a narrow window from the strip to `compact` -- which redraws the same
   * strip, so the control they pressed would look broken.
   *
   * The case this departure exists for is folded AND narrow, and it has its
   * own witness (MAR-3292 lap 2, B): `lap 2, B: folded and too narrow at
   * once -- both reasons true, and every way out still leads somewhere`, in
   * `wave-panel.render.test.tsx` under `MAR-3292: Loom folds to a narrow
   * column of icons`. Write `stored === 'folded'` here instead and that test
   * goes red; nothing else in the file does.
   */
  const columnFitsHere =
    effectiveWavePanelMode({
      stored: 'compact',
      storedWidth: draftWidth ?? storedWidth,
      windowWidth,
      reservedWidth,
    }).mode === 'compact'
  // Whether the panel renders anything at all (MAR-3161 R4): the last bound
  // crew gone. ONE const, read by the early return below and by the
  // on-screen fact -- which adds the second reason a column can be absent,
  // the strip (the decision). The hook outlives the handle -- hold the edge
  // while either happens and the mouse-up still arrives -- so asking it
  // about the strip alone would be asking a proxy for the question (lap 3, B).
  const columnAbsent = board.boundCrewCount === 0
  const onScreen =
    !columnAbsent && decision.mode === 'compact'
      ? { width: decision.width, maxWidth: decision.maxWidth }
      : null
  // The strip has no field (R8): going there empties the search, so the
  // column that comes back is the whole Loom, not a filter nobody can see.
  if (decision.mode === 'strip' && searchText !== '') setSearchText('')
  const resize = useWaveColumnResize({
    reservedWidth,
    // The decision's own numbers (lap 2, B): the ceiling's arithmetic lives
    // in one place, and a gesture is weighed against what the screen shows.
    column: onScreen,
    // The real preference — never the draft (MAR-3161 R2).
    storedWidth,
    onCommit: commitWidth,
    defaultWidth: WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
    onDraft: setDraftWidth,
  })

  // What the layout has to know, and the one thing it cannot work out: a
  // panel that is not on screen at all is not expanded over anything.
  const expanded = !columnAbsent && decision.mode === 'expanded'
  useEffect(() => {
    onExpandedChange?.(expanded)
  }, [expanded, onExpandedChange])

  /**
   * Focus follows the shape, in EVERY direction (MAR-3189 R7; MAR-3292 lap
   * 2, A).
   *
   * Whichever control was pressed -- `Expand`, `Fold Loom`, `Collapse`,
   * `Open Loom`, a folded icon, or Esc on the stack -- leaves the document
   * with the shape it belonged to, so without this the focus ring falls to
   * `<body>` and the keyboard has lost its place. On a fold that only costs
   * a tab stop; on an EXPAND it costs the Esc key itself, because the
   * stack's handler never sees a keypress that was never aimed at it.
   *
   * Keyed on the DECISION's mode, not on the `expanded` boolean it used to
   * watch: there are three shapes, not two, and keying on two of them left
   * three of the fold's four transitions stranded at `<body>` -- and the
   * strip is a shape with no title, so it names its own landing place.
   */
  const titleElement = useRef<HTMLButtonElement | null>(null)
  const stripOpenElement = useRef<HTMLButtonElement | null>(null)
  const wasMode = useRef(decision.mode)
  useEffect(() => {
    if (wasMode.current !== decision.mode) {
      // Only what was LOST is given back (MAR-3292 lap 2, A, departure): the
      // shape can also change because the window was dragged narrow, and
      // then the person is somewhere else entirely -- the composer, the
      // sidebar -- with their focus still under their hands. `<body>` is the
      // measurable fact that the element holding focus went away with the
      // shape; anything else is a place someone is still standing.
      const lost =
        document.activeElement === null ||
        document.activeElement === document.body
      if (lost) {
        if (decision.mode === 'strip') stripOpenElement.current?.focus()
        else titleElement.current?.focus()
      }
    }
    wasMode.current = decision.mode
  }, [decision.mode])

  /**
   * Whether the shell should SLIDE into this shape, or simply be it
   * (MAR-3312 R1/R3).
   *
   * Derived DURING render, not in an effect: an effect runs after the DOM
   * already carries the new width, and a transition that is switched on after
   * the value moved has nothing left to interpolate -- the fold would snap
   * exactly as it did before. Adjusting state while rendering makes React
   * re-render before it commits, so the shell reaches the DOM with
   * `data-loom-motion="slide"` and the new width in the SAME style change,
   * which is the one arrangement the transition spec starts from.
   *
   * Only between the two NARROW shapes. Expanded is a portal over the content
   * area with its own motion, and folding back out of it mounts a shell that
   * was not on screen a moment ago -- there is no width to travel from, and a
   * fade there would be a blank column for a fifth of a second on a path this
   * issue promised not to touch (R7).
   *
   * A lap COUNTER rather than a boolean, so a second fold before the first
   * has settled restarts the timer instead of inheriting the old one's
   * deadline -- `setSliding(true)` over `true` is not a state change, and the
   * effect would never re-run.
   */
  const [shellMode, setShellMode] = useState(decision.mode)
  const [slideLap, setSlideLap] = useState(0)
  if (shellMode !== decision.mode) {
    const narrow = (mode: typeof decision.mode) => mode !== 'expanded'
    setShellMode(decision.mode)
    setSlideLap(
      narrow(shellMode) && narrow(decision.mode) ? (lap) => lap + 1 : 0,
    )
  }
  const sliding = slideLap > 0
  useEffect(() => {
    if (slideLap === 0) return
    // The slide and the fade that follows it; after that the shell is still
    // again, and the handle's drag moves the column pixel for pixel.
    const timer = window.setTimeout(
      () => setSlideLap(0),
      LOOM_SLIDE_MS + LOOM_ENTER_MS,
    )
    return () => window.clearTimeout(timer)
  }, [slideLap])
  // The guide's own open/closed, and the control that opened it. Closing
  // puts focus back where it was, because a modal that returns a person to
  // nowhere has moved them without asking (MAR-3201 R6).
  const [guideOpen, setGuideOpen] = useState(false)
  const guideButton = useRef<HTMLButtonElement | null>(null)
  const openGuide = useCallback(() => setGuideOpen(true), [])
  const closeGuide = useCallback(() => setGuideOpen(false), [])
  // When Loom itself is gone -- no bound crew -- the guide goes with it
  // (lap 3, A). Closed, not merely unmounted: a guide left `open` would come
  // back by itself the moment a crew is bound again, which is the one thing
  // R9 forbids.
  useEffect(() => {
    if (columnAbsent) setGuideOpen(false)
  }, [columnAbsent])

  // The falling edge, the same shape this file uses for a closed detail and
  // a folded stack: focus can only go back once the dialog's focus scope has
  // unmounted, because until then it pulls the keyboard straight back in.
  const guideWasOpen = useRef(false)
  useEffect(() => {
    if (guideWasOpen.current && !guideOpen) guideButton.current?.focus()
    guideWasOpen.current = guideOpen
  }, [guideOpen])
  // Stable, deliberately: an inline ref callback is a new function on every
  // render, so React detaches it (with `null`) and re-attaches it each time
  // -- and one of those renders is the one that closes the guide, which left
  // the ref empty at the exact moment focus was being returned.
  const guideRef = useCallback((element: HTMLButtonElement | null) => {
    guideButton.current = element
  }, [])

  const titleRef = useCallback((element: HTMLButtonElement | null) => {
    titleElement.current = element
  }, [])

  // Stable for the same reason `guideRef` is: an inline callback is a new
  // function every render, so React detaches it with `null` and re-attaches
  // it -- and one of those renders is the one the focus effect runs after.
  const stripOpenRef = useCallback((element: HTMLButtonElement | null) => {
    stripOpenElement.current = element
  }, [])

  if (columnAbsent) return null

  const detailView =
    detailRow === null
      ? null
      : {
          view: loomIssueDetail({
            row: detailRow,
            opening: board.resolveRow(detailRow.entry),
            horse: detailHorse,
            lastOkAt: board.lastOkAtOf(detailRow.entry.crewId),
            now: board.now,
          }),
          onClose: closeDetail,
          onOpenConversation: (session: SessionSummary) =>
            onOpenSession?.(session),
          closeRef: closeButton,
        }

  const stack = {
    dispatchPlan: board.dispatchPlan,
    sheets: board.sheets,
    now: board.now,
    horses: board.horses,
    qaExpanded,
    onToggleQa: () => setQaExpanded((was) => !was),
    onOpenSeat: openSeat,
    onShowNext: () => selectSheet('next'),
    onShowDetail: showDetail,
    detail: detailView,
    // The ordering (MAR-3195 R5, MAR-3234 R6): a non-empty search clears
    // first, then an open detail closes, and only then does expanded fold.
    onEscape:
      searchText !== ''
        ? clearSearch
        : detailKey === null
          ? undefined
          : closeDetail,
    header: board.header,
    // The crew on screen, and only while its tracker is answering (R6): an
    // outage keeps the line it always had and gets no control beside it.
    refresh:
      board.selectedCrewId !== null && board.header.kind !== 'outage' ? (
        <LoomRefresh
          key={board.selectedCrewId}
          crewId={board.selectedCrewId}
          lastOkAt={board.lastOkAtOf(board.selectedCrewId)}
        />
      ) : null,
    // The crew on screen's issues outside the loop (MAR-3236), keyed by the
    // crew so a switch is a fresh, folded group reading that crew's list.
    outside:
      board.selectedCrewId !== null ? (
        <LoomOutside
          key={board.selectedCrewId}
          snapshot={outsideSnapshot}
          query={query}
        />
      ) : null,
    field: {
      value: searchText,
      onChange: setSearchText,
      onClear: () => {
        clearSearch()
        focusSearch()
      },
      onApply: applySearch,
      inputRef: searchInputRef,
      revealed: searchRevealed,
      onToggleReveal: () => {
        // The icon hides an EMPTY field; one holding a query stays (R7).
        if (searchRevealed && searchText === '') setSearchAsked(false)
        else focusSearch()
      },
      onShortcut: focusSearch,
    },
    search:
      query === null
        ? null
        : {
            summary: loomSearchSummary({
              sheets: board.sheets,
              outside: outsideSnapshot,
              query,
              open: sheet,
            }),
            nowhere: loomSearchNowhereLine({
              query,
              crewName:
                board.crewOptions.find(
                  (crew) => crew.id === board.selectedCrewId,
                )?.name ?? null,
              outsideReadAt: outsideSnapshot?.readAt ?? null,
              now: board.now,
              severalCrews: board.boundCrewCount > 1,
            }),
            shownHorses: board.shownHorses,
          },
    subline: {
      text: loomSubline(
        board.crewOptions.find((crew) => crew.id === board.selectedCrewId)
          ?.name ?? null,
      ),
      // A choice only when there is one (R3): with one bound crew the line
      // is the text it always was, and no control is drawn.
      picker:
        loomCrewHasChoice(board.crewOptions) && board.selectedCrewId !== null
          ? {
              options: board.crewOptions,
              selectedId: board.selectedCrewId,
              // Switching keeps the sheet, the mode and the width -- the
              // person's place in LOOM, not in a crew -- and closes an open
              // detail without a line of its own here (R4): the detail's key
              // is crew-scoped (`crew:issue`) and resolved against the shown
              // crew's rows only, so it finds nothing on another crew's board
              // and lap 2, C's effect clears it. A second close here was
              // proven redundant by mutation, so it is not written.
              onSelect: board.selectCrew,
              // Shown with the picker and never on its own (MAR-3291 R3):
              // with one bound crew there is nothing to follow TO.
              follow: {
                on: board.followsConversation,
                onToggle: board.setFollowsConversation,
              },
            }
          : null,
    },
    open: sheet,
    onSelectSheet: selectSheet,
    inertReason: LOOM_ROWS_ALWAYS_OPEN,
    // In Loom a row is a door to the ISSUE (MAR-3195); the refusal words live
    // inside the detail.
    onOpen: showDetail,
    bodyRef,
    onBodyScroll,
    titleRef,
    onOpenGuide: openGuide,
    guideRef,
  }

  /**
   * The guide: a SIBLING of whichever shell is drawn, and keyed twice over.
   *
   * A sibling, never a child (R6): React portals bubble synthetic events
   * through the React tree, so a dialog rendered under `LoomExpandedView`
   * would deliver its Escape keydown to that section's `onKeyDown` -- which
   * folds Loom. Out here the shells are not ancestors, so the key cannot
   * reach them and nothing had to be stopped by hand.
   *
   * The key is stable while a session lasts, so React matches the guide
   * across the three shells instead of matching it by position against
   * whatever each branch renders first (lap 3, A) -- narrowing the window
   * past the strip threshold used to unmount the dialog mid-step. And it
   * CHANGES when the guide closes, so the next session is a fresh mount with
   * no state to correct (lap 3, B) -- whichever way it closed, including the
   * panel closing it because Loom's column went away.
   */
  const guide = (
    <LearnLoomGuide
      key={`learn-loom-${guideOpen}`}
      open={guideOpen}
      onClose={closeGuide}
    />
  )

  /**
   * The shell for this mode -- and the guide beside it, always (lap 3, A).
   *
   * One return rather than three, so the guide is the same keyed element in
   * every mode: rendered per branch, a window narrowing past the strip
   * threshold unmounted the dialog mid-step, and widening again mounted a
   * fresh one that was still `open`.
   */
  const withGuide = (shell: ReactNode) => (
    <>
      {shell}
      {guide}
    </>
  )

  if (decision.mode === 'expanded') {
    const expandedStack = (
      <LoomExpandedView
        {...stack}
        onFold={() => changeMode('compact')}
        onCollapse={() => changeMode('folded')}
      />
    )
    return withGuide(
      expandedContainer
        ? createPortal(expandedStack, expandedContainer)
        : expandedStack,
    )
  }

  // Where "open it again" leads (MAR-3292 R3): the column when this window
  // can hold one, the content area when it cannot. Both are Loom with its
  // sheets, which is the promise the folded column makes.
  const openLoom = () => changeMode(columnFitsHere ? 'compact' : 'expanded')
  // The compact shape or nothing, so the width and the ceiling this branch
  // needs are read off the decision that HAS them (lap 2, B) rather than
  // asserted past a boolean.
  const column = decision.mode === 'compact' ? decision : null

  /**
   * One shell, two contents (MAR-3312 R1).
   *
   * The strip and the column are different components; returned side by side
   * from two branches they share no element, so a fold had nothing to
   * animate and the column vanished in a frame. Here they are two children
   * of ONE `div` that React matches across the change -- same position, same
   * type, no `key` -- and the browser interpolates its width between the
   * stored column and the strip's 44 px.
   *
   * The handle stays OUTSIDE the shell, as it was outside the aside: it is
   * the column's right EDGE, it straddles that edge with negative margins,
   * and inside a box that clips its overflow half its grab area would be
   * gone. It is also the second child in BOTH modes -- `null` when there is
   * no column -- because a fragment whose first child changed shape would
   * cost the shell the identity the whole slide rests on.
   */
  return withGuide(
    <>
      <div
        data-loom-shell
        data-loom-motion={sliding ? 'slide' : 'still'}
        className={LOOM_SHELL_CLASS}
        // `width` and the region, nothing else (R2/R4): an inline
        // `transition` would out-specify `motion-reduce`, and a shell that
        // declared no region would hand the moving column to whatever strip
        // is underneath it (MAR-3284's law).
        style={{
          width: column ? column.width : LOOM_STRIP_WIDTH_PX,
          ...LOOM_NO_DRAG_STYLE,
        }}
      >
        {column ? (
          <LoomCompactView
            {...stack}
            className={sliding ? LOOM_ENTER_CLASS : undefined}
            width={column.width}
            onExpand={() => changeMode('expanded')}
            onCollapse={() => changeMode('folded')}
          />
        ) : (
          <LoomStripView
            className={sliding ? LOOM_ENTER_CLASS : undefined}
            dispatchPlan={board.dispatchPlan}
            sheets={board.sheets}
            now={board.now}
            horses={board.horses}
            outage={board.header.kind === 'outage'}
            openRef={stripOpenRef}
            onOpen={openLoom}
            onExpand={() => changeMode('expanded')}
            // One act, not two halves a person can land between: the sheet
            // FIRST, so the shape that mounts is already reading the sheet
            // the icon named. Changing the mode alone would open Loom
            // wherever it was last left, which is the one thing this control
            // promises not to do.
            onSelectSheet={(next) => {
              selectSheet(next)
              openLoom()
            }}
          />
        )}
      </div>
      {column ? (
        <WaveResizeHandle
          width={column.width}
          min={WAVE_PANEL_MIN_COLUMN_WIDTH}
          // What this window can actually do, not what the constant allows: a
          // separator that announces 280-400 while 320 is the most it can give
          // is telling a screen reader something the mechanism refuses.
          max={column.maxWidth}
          onMouseDown={resize.onHandleMouseDown}
          onKeyDown={resize.onHandleKeyDown}
          onDoubleClick={resize.onHandleDoubleClick}
        />
      ) : null}
    </>,
  )
}
