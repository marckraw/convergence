import type { FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { WavePanelView } from './wave-panel.presentational'
import { useWaveBoard } from './use-wave-board'

/**
 * Mission Control's Waves tab: the same ledger, full width, with its own line
 * (MAR-3097 R6; lap 2, D). This is where an unbound app learns to connect a
 * tracker. It keeps the four sections it has always had -- Loom's sheets are
 * the column's shape, not the board's (MAR-3189 R6).
 */
export const WavesTab: FC<{
  onOpenSession?: (session: SessionSummary) => void
}> = ({ onOpenSession }) => {
  const board = useWaveBoard('all')
  const inertReason = (entry: WorkLedgerEntry) => {
    const opening = board.resolveRow(entry)
    return opening.openable ? null : opening.reason
  }
  const openRow = (entry: WorkLedgerEntry) => {
    const opening = board.resolveRow(entry)
    if (opening.openable) onOpenSession?.(opening.session)
  }
  return (
    <WavePanelView
      sections={board.sections}
      header={board.header}
      boardLine={board.boardLine}
      inertReason={inertReason}
      onOpen={openRow}
    />
  )
}
