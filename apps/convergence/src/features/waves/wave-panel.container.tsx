import { useCallback, useEffect, useState, type FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { loadWavePanelMode, saveWavePanelMode } from './wave-panel-mode.api'
import type { WavePanelMode } from './wave-panel-mode.pure'
import { loadWavePanelWidth, saveWavePanelWidth } from './wave-panel-width.api'
import { WavePanelView } from './wave-panel.presentational'
import { WaveRailView } from './wave-rail.presentational'
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
 * The wave column beside the conversation (MAR-3097). Mounted only when a
 * crew reads a tracker; not beside Mission Control's own Waves tab; open or
 * collapsed to its rail, the choice kept between runs -- and the rail, without
 * touching that choice, when the window is too narrow. Never writes to the
 * tracker.
 */
export const WavePanel: FC<WavePanelProps> = ({
  onOpenSession,
  hidden = false,
  reservedWidth = 0,
}) => {
  const board = useWaveBoard()
  const [stored, setStored] = useState<WavePanelMode>(loadWavePanelMode)
  const [storedWidth, setStoredWidth] = useState<number>(loadWavePanelWidth)
  const windowWidth = useWindowWidth()
  const changeMode = useCallback((next: WavePanelMode) => {
    setStored(next)
    saveWavePanelMode(next)
  }, [])
  /**
   * A finished gesture, and only a finished gesture, becomes the preference
   * (R2, lap 2 A/C, lap 3 A).
   *
   * What arrives here is what the person MEANT: a drag or a step that moved
   * the column brings the width they ended on; one the window refused, and
   * a drag or a step over a column that is no longer on screen, brings
   * nothing; a reset brings the default. The clamp is the storage's own [MIN, MAX], never the
   * window's, and the round is done once here -- so **the state and the store
   * hold one number**, which is the preference, while the number on screen is
   * the decision's and may be smaller. In the case this whole issue is about
   * they differ on purpose: state and store 600, screen 400.
   */
  const commitWidth = useCallback((next: number) => {
    const chosen = Math.round(
      clampWavePanelWidth(next, WAVE_PANEL_MAX_COLUMN_WIDTH),
    )
    setStoredWidth(chosen)
    saveWavePanelWidth(chosen)
  }, [])
  const { inertReason, openRow } = useRowDoors(board, onOpenSession)
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
  // the third reason a column can be absent, the rail (the decision). The
  // hook outlives the handle -- hold the edge while any of the three happens
  // and the mouse-up still arrives -- so asking it about the rail alone
  // would be asking a proxy for the question (lap 3, B).
  const columnAbsent = hidden || board.boundCrewCount === 0
  const onScreen =
    !columnAbsent && decision.mode === 'open'
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

  if (columnAbsent) return null

  return decision.mode === 'rail' ? (
    <WaveRailView
      sections={board.sections}
      outage={board.header.kind === 'outage'}
      narrow={decision.reason === 'narrow'}
      onExpand={() => changeMode('open')}
    />
  ) : (
    // The handle is the column's right EDGE, so it is a sibling in the shell's
    // flex row rather than a child of the aside -- the same shape the
    // sidebar's handle has. On this branch the decision HAS a width and a
    // ceiling (lap 2, B), so there is no fallback to reach for.
    <>
      <WavePanelView
        layout="column"
        sections={board.sections}
        header={board.header}
        inertReason={inertReason}
        onOpen={openRow}
        onCollapse={() => changeMode('rail')}
        width={decision.width}
      />
      <WaveResizeHandle
        width={decision.width}
        min={WAVE_PANEL_MIN_COLUMN_WIDTH}
        // What this window can actually do, not what the constant allows: a
        // separator that announces 240-640 while 400 is the most it can give
        // is telling a screen reader something the mechanism refuses.
        max={decision.maxWidth}
        onMouseDown={resize.onHandleMouseDown}
        onKeyDown={resize.onHandleKeyDown}
        onDoubleClick={resize.onHandleDoubleClick}
      />
    </>
  )
}

/**
 * Mission Control's Waves tab: the same board, full width, with its own line
 * (R6; lap 2, D). This is where an unbound app learns to connect a tracker.
 */
export const WavesTab: FC<Pick<WavePanelProps, 'onOpenSession'>> = ({
  onOpenSession,
}) => {
  const board = useWaveBoard()
  const { inertReason, openRow } = useRowDoors(board, onOpenSession)
  return (
    <WavePanelView
      layout="full"
      sections={board.sections}
      header={board.header}
      boardLine={board.boardLine}
      inertReason={inertReason}
      onOpen={openRow}
    />
  )
}
