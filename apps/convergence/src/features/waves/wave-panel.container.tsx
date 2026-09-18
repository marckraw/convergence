import {
  useCallback,
  useEffect,
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
import { LoomCompactView } from './loom-compact.presentational'
import { LoomExpandedView } from './loom-expanded.presentational'
import { LoomStripView } from './wave-rail.presentational'
import { WaveResizeHandle } from './wave-resize-handle.presentational'
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

/** Both doors of a row read one lookup (lap 2, F4). */
function useRowDoors(
  board: WaveBoard,
  onOpenSession?: (s: SessionSummary) => void,
) {
  const inertReason = useCallback(
    (entry: WorkLedgerEntry) => {
      const opening = board.resolveRow(entry)
      return opening.openable ? null : opening.reason
    },
    [board],
  )
  const openRow = useCallback(
    (entry: WorkLedgerEntry) => {
      const opening = board.resolveRow(entry)
      if (opening.openable) onOpenSession?.(opening.session)
    },
    [board, onOpenSession],
  )
  return { inertReason, openRow }
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
  const windowWidth = useWindowWidth()
  const changeMode = useCallback((next: WavePanelMode) => {
    setStored(next)
    saveWavePanelMode(next)
  }, [])
  const selectSheet = useCallback((next: LoomSheet) => {
    setSheet(next)
    saveLoomSheet(next)
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
  const { inertReason, openRow } = useRowDoors(board, onOpenSession)
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

  const stack = {
    sheets: board.sheets,
    header: board.header,
    subline: loomSubline(board.crewNames),
    open: sheet,
    onSelectSheet: selectSheet,
    inertReason,
    onOpen: openRow,
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
