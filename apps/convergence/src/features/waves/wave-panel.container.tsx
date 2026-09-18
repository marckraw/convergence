import { useCallback, useEffect, useState, type FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { loadWavePanelMode, saveWavePanelMode } from './wave-panel-mode.api'
import type { WavePanelMode } from './wave-panel-mode.pure'
import { WavePanelView } from './wave-panel.presentational'
import { WaveRailView } from './wave-rail.presentational'
import { effectiveWavePanelMode } from './wave-sections.pure'
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
  const windowWidth = useWindowWidth()
  const changeMode = useCallback((next: WavePanelMode) => {
    setStored(next)
    saveWavePanelMode(next)
  }, [])
  const { inertReason, openRow } = useRowDoors(board, onOpenSession)

  if (hidden || board.boundCrewCount === 0) return null

  const decision = effectiveWavePanelMode({
    stored,
    windowWidth,
    reservedWidth,
  })
  return decision.mode === 'rail' ? (
    <WaveRailView
      sections={board.sections}
      outage={board.header.kind === 'outage'}
      narrow={decision.reason === 'narrow'}
      onExpand={() => changeMode('open')}
    />
  ) : (
    <WavePanelView
      layout="column"
      sections={board.sections}
      header={board.header}
      inertReason={inertReason}
      onOpen={openRow}
      onCollapse={() => changeMode('rail')}
    />
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
