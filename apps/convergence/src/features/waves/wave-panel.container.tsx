import { useCallback, useState, type FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { loadWavePanelMode, saveWavePanelMode } from './wave-panel-mode.api'
import type { WavePanelMode } from './wave-panel-mode.pure'
import { WavePanelView } from './wave-panel.presentational'
import { WaveRailView } from './wave-rail.presentational'
import { useWaveBoard } from './use-wave-board'

interface WavePanelProps {
  onOpenSession?: (session: SessionSummary) => void
  /** Where "Connect a tracker" goes: Mission Control, where crews are bound. */
  onConnectTracker?: () => void
}

function useOpenRow(
  resolveSession: (entry: WorkLedgerEntry) => SessionSummary | null,
  onOpenSession?: (session: SessionSummary) => void,
) {
  return useCallback(
    (entry: WorkLedgerEntry) => {
      const session = resolveSession(entry)
      if (session) onOpenSession?.(session)
    },
    [resolveSession, onOpenSession],
  )
}

/**
 * The wave column beside the conversation (MAR-3097): open, or collapsed to
 * its rail, the choice kept between runs. Never writes to the tracker.
 */
export const WavePanel: FC<WavePanelProps> = ({
  onOpenSession,
  onConnectTracker,
}) => {
  const board = useWaveBoard()
  const [mode, setMode] = useState<WavePanelMode>(loadWavePanelMode)
  const changeMode = useCallback((next: WavePanelMode) => {
    setMode(next)
    saveWavePanelMode(next)
  }, [])
  const openRow = useOpenRow(board.resolveSession, onOpenSession)

  return mode === 'rail' ? (
    <WaveRailView
      sections={board.sections}
      outage={board.header.kind === 'outage'}
      onExpand={() => changeMode('open')}
    />
  ) : (
    <WavePanelView
      layout="column"
      sections={board.sections}
      header={board.header}
      inertReason={board.inertReason}
      onOpen={openRow}
      onConnectTracker={onConnectTracker}
      onCollapse={() => changeMode('rail')}
    />
  )
}

/** Mission Control's Waves tab: the same board, full width (R6). */
export const WavesTab: FC<Pick<WavePanelProps, 'onOpenSession'>> = ({
  onOpenSession,
}) => {
  const board = useWaveBoard()
  const openRow = useOpenRow(board.resolveSession, onOpenSession)
  return (
    <WavePanelView
      layout="full"
      sections={board.sections}
      header={board.header}
      inertReason={board.inertReason}
      onOpen={openRow}
    />
  )
}
