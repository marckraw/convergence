import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
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
import { loomIssueDetail } from './loom-detail.pure'
import type { LoomSheetDetail } from './loom-stack.types'
import { LoomCompactView } from './loom-compact.presentational'
import { LoomExpandedView } from './loom-expanded.presentational'
import { LoomStripView } from './loom-strip.presentational'
import { WaveResizeHandle } from './wave-resize-handle.presentational'
import { waveRowKey, type WaveRow } from './wave-sections.pure'
import {
  clampWavePanelWidth,
  effectiveWavePanelMode,
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
  WAVE_PANEL_MIN_COLUMN_WIDTH,
} from './wave-sections.pure'
import { useWaveColumnResize } from './use-wave-column-resize'
import { useWaveBoard, type WaveBoard } from './use-wave-board'

interface WavePanelProps {
  onOpenSession?: (session: SessionSummary) => void
  /**
   * Mission Control is showing its Waves tab (lap 2, B): the column would be
   * the same board twice, so it steps aside.
   */
  hidden?: boolean
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
 * Why a row cannot be opened, read once (lap 2, F4).
 *
 * The matching `openRow` left with MAR-3195: in Loom a row is a door to the
 * ISSUE now, and the conversation opens from inside the detail. The reason a
 * row would refuse is still shown on the row itself, so the lookup stays.
 */
function useRowDoors(board: WaveBoard) {
  return useCallback(
    (entry: WorkLedgerEntry) => {
      const opening = board.resolveRow(entry)
      return opening.openable ? null : opening.reason
    },
    [board],
  )
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
function useSheetScroll(sheet: LoomSheet) {
  const offsets = useRef<Record<LoomSheet, number>>({
    before: 0,
    now: 0,
    next: 0,
    plan: 0,
  })
  // Keyed on the open sheet, so React tears the old body down and hands us the
  // new one -- which is exactly when the offset has to go back on.
  const bodyRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) element.scrollTop = offsets.current[sheet]
    },
    [sheet],
  )
  const onBodyScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      offsets.current[sheet] = event.currentTarget.scrollTop
    },
    [sheet],
  )
  return { bodyRef, onBodyScroll }
}

/**
 * Loom beside the conversation (MAR-3097, MAR-3189). Mounted only when a crew
 * reads a tracker; not beside Mission Control's own Waves tab. Four sheets,
 * one open, compact in its column or expanded across the content area -- and
 * the strip, without touching any choice, when the window is too narrow for a
 * column. Never writes to the tracker.
 */
export const WavePanel: FC<WavePanelProps> = ({
  onOpenSession,
  hidden = false,
  reservedWidth = 0,
  onExpandedChange,
  expandedContainer,
}) => {
  const board = useWaveBoard()
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
  const inertReason = useRowDoors(board)
  /**
   * Every row Loom can show, flat, for the detail's key lookup (R1).
   *
   * All five groups, because a detail stays open while its issue moves --
   * from Now to Before when it is accepted, say -- and a lookup that only
   * searched the sheet it was opened from would close the card under a
   * person's hands at the moment the thing they were reading changed.
   */
  const allRows = useMemo(
    () => [
      ...board.sheets.before,
      ...board.sheets.now.inFlight,
      ...board.sheets.now.awaitingQa,
      ...board.sheets.now.fablesTurn,
      ...board.sheets.now.decide,
      ...board.sheets.next,
      ...board.sheets.plan,
    ],
    [board.sheets],
  )
  const detailRow = useMemo(
    () =>
      detailKey === null
        ? null
        : (allRows.find((row) => waveRowKey(row.entry) === detailKey) ?? null),
    [allRows, detailKey],
  )
  /** The horse whose seat this row belongs to, for the detail's two lines. */
  const detailHorse = useMemo(() => {
    if (!detailRow) return null
    const key = waveRowKey(detailRow.entry)
    return (
      board.horses.find(
        (horse) =>
          (horse.held && waveRowKey(horse.held.entry) === key) ||
          (horse.returned && waveRowKey(horse.returned.entry) === key),
      ) ??
      board.horses.find(
        (horse) =>
          horse.crewId === detailRow.entry.crewId &&
          horse.seat === detailRow.entry.seat,
      ) ??
      null
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
  const showDetail = useCallback((row: WaveRow) => {
    // The SELECTOR, not the element: the rows are unmounted while the detail
    // has the body, so the node that was clicked is detached by the time the
    // card closes and focusing it would put the keyboard nowhere.
    const active = document.activeElement
    openedFrom.current =
      active instanceof HTMLElement
        ? active.closest('[data-wave-row]')?.getAttribute('data-wave-row')
          ? `[data-wave-row="${active.closest('[data-wave-row]')!.getAttribute('data-wave-row')}"]`
          : active.closest('[data-loom-horse]')
            ? `[data-loom-horse="${active.closest('[data-loom-horse]')!.getAttribute('data-loom-horse')}"] button`
            : null
        : null
    setDetailKey(waveRowKey(row.entry))
  }, [])
  const closeDetail = useCallback(() => setDetailKey(null), [])
  // Focus returns once the rows are back on screen (R5), which is a render
  // later than the click that closed the card.
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
  const { bodyRef, onBodyScroll } = useSheetScroll(sheet)
  // The draft is asked for before the early returns below, because hooks are
  // not optional; it is only READ when a column is on screen.
  const [draftWidth, setDraftWidth] = useState<number | null>(null)
  const decision = effectiveWavePanelMode({
    stored,
    storedWidth: draftWidth ?? storedWidth,
    windowWidth,
    reservedWidth,
  })
  // Whether the panel renders anything at all (MAR-3161 R4): the Waves tab
  // showing the same board (`hidden`), or the last bound crew gone. ONE const,
  // read by the early return below and by the on-screen fact -- which adds
  // the third reason a column can be absent, the strip (the decision). The
  // hook outlives the handle -- hold the edge while any of the three happens
  // and the mouse-up still arrives -- so asking it about the strip alone
  // would be asking a proxy for the question (lap 3, B).
  const columnAbsent = hidden || board.boundCrewCount === 0
  const onScreen =
    !columnAbsent && decision.mode === 'compact'
      ? { width: decision.width, maxWidth: decision.maxWidth }
      : null
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
   * Focus follows the shape, in BOTH directions (R7; lap 2, C).
   *
   * Whichever control was pressed -- `Expand`, `Fold Loom`, or Esc on the
   * stack -- leaves the document with the shape it belonged to, so without
   * this the focus ring falls to `<body>` and the keyboard has lost its
   * place. On a fold that only costs a tab stop; on an EXPAND it costs the
   * Esc key itself, because the stack's handler never sees a keypress that
   * was never aimed at it.
   */
  const titleElement = useRef<HTMLButtonElement | null>(null)
  const wasExpanded = useRef(expanded)
  useEffect(() => {
    if (wasExpanded.current !== expanded) titleElement.current?.focus()
    wasExpanded.current = expanded
  }, [expanded])
  const titleRef = useCallback((element: HTMLButtonElement | null) => {
    titleElement.current = element
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
          }) as LoomSheetDetail['view'],
          onClose: closeDetail,
          onOpenConversation: (session: unknown) =>
            onOpenSession?.(session as SessionSummary),
          closeRef: closeButton,
        }

  const stack = {
    sheets: board.sheets,
    horses: board.horses,
    qaExpanded,
    onToggleQa: () => setQaExpanded((was) => !was),
    onOpenSeat: openSeat,
    onShowNext: () => selectSheet('next'),
    onShowDetail: showDetail,
    detail: detailView,
    // The ordering R5 is about: a detail open means Escape closes THAT.
    onEscape: detailKey === null ? undefined : closeDetail,
    header: board.header,
    subline: loomSubline(board.crewNames),
    open: sheet,
    onSelectSheet: selectSheet,
    inertReason,
    // In Loom a row is a door to the ISSUE (MAR-3195); the Waves tab's rows
    // still open the conversation, through `WavesTab`'s own `openRow`.
    onOpen: (entry: WorkLedgerEntry) =>
      showDetail({
        entry,
        action: null,
        hostMarker: null,
        crewName: null,
        lapLabel: '',
      }),
    bodyRef,
    onBodyScroll,
    titleRef,
  }

  if (decision.mode === 'strip') {
    return (
      <LoomStripView
        sheets={board.sheets}
        outage={board.header.kind === 'outage'}
        onExpand={() => changeMode('expanded')}
      />
    )
  }

  if (decision.mode === 'expanded') {
    const expandedStack = (
      <LoomExpandedView {...stack} onFold={() => changeMode('compact')} />
    )
    return expandedContainer
      ? createPortal(expandedStack, expandedContainer)
      : expandedStack
  }

  // The handle is the column's right EDGE, so it is a sibling in the shell's
  // flex row rather than a child of the aside -- the same shape the sidebar's
  // handle has. On this branch the decision HAS a width and a ceiling (lap 2,
  // B), so there is no fallback to reach for.
  return (
    <>
      <LoomCompactView
        {...stack}
        width={decision.width}
        onExpand={() => changeMode('expanded')}
      />
      <WaveResizeHandle
        width={decision.width}
        min={WAVE_PANEL_MIN_COLUMN_WIDTH}
        // What this window can actually do, not what the constant allows: a
        // separator that announces 280-400 while 320 is the most it can give
        // is telling a screen reader something the mechanism refuses.
        max={decision.maxWidth}
        onMouseDown={resize.onHandleMouseDown}
        onKeyDown={resize.onHandleKeyDown}
        onDoubleClick={resize.onHandleDoubleClick}
      />
    </>
  )
}
