import type { FC } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { waveRowKey, type WaveRow } from './wave-sections.pure'
import { WaveRowView } from './wave-row.presentational'
import { WAVE_SECTION_TITLE_CLASS } from './wave-panel.styles'

interface WaveSectionViewProps {
  title: string
  rows: WaveRow[]
  inertReason: (entry: WorkLedgerEntry) => string | null
  onOpen: (entry: WorkLedgerEntry) => void
  /**
   * A disclosure rather than a list (lap 2, F2): a wave group repeats rows
   * already shown in their sections, so in the narrow column it starts
   * closed with its name and count, and in the full tab it starts open.
   */
  disclosure?: 'open' | 'closed'
}

/** One titled section of the wave panel, with its count; empty draws nothing. */
export const WaveSectionView: FC<WaveSectionViewProps> = ({
  title,
  rows,
  inertReason,
  onOpen,
  disclosure,
}) => {
  if (rows.length === 0) return null
  const list = rows.map((row) => (
    <WaveRowView
      key={waveRowKey(row.entry)}
      row={row}
      inertReason={inertReason(row.entry)}
      onOpen={onOpen}
    />
  ))
  const heading = `${title} · ${rows.length}`

  return disclosure ? (
    <details
      aria-label={title}
      data-wave-group={title}
      open={disclosure === 'open'}
      className="flex flex-col"
    >
      <summary className={`${WAVE_SECTION_TITLE_CLASS} cursor-pointer`}>
        {heading}
      </summary>
      {list}
    </details>
  ) : (
    <section aria-label={title} className="flex flex-col">
      <h3 className={WAVE_SECTION_TITLE_CLASS}>{heading}</h3>
      {list}
    </section>
  )
}
