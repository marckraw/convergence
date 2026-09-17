import type { FC } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import type { WaveRow } from './wave-sections.pure'
import { WaveRowView } from './wave-row.presentational'
import { WAVE_SECTION_TITLE_CLASS } from './wave-panel.styles'

interface WaveSectionViewProps {
  title: string
  rows: WaveRow[]
  inertReason: (entry: WorkLedgerEntry) => string | null
  onOpen: (entry: WorkLedgerEntry) => void
}

/** One titled section of the wave panel, with its count; empty draws nothing. */
export const WaveSectionView: FC<WaveSectionViewProps> = ({
  title,
  rows,
  inertReason,
  onOpen,
}) => {
  if (rows.length === 0) return null
  return (
    <section aria-label={title} className="flex flex-col">
      <h3 className={WAVE_SECTION_TITLE_CLASS}>
        {title} · {rows.length}
      </h3>
      {rows.map((row) => (
        <WaveRowView
          key={row.entry.id}
          row={row}
          inertReason={inertReason(row.entry)}
          onOpen={onOpen}
        />
      ))}
    </section>
  )
}
