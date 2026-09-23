import type { FC, ReactNode } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { waveRowKey, type WaveRow } from './wave-sections.pure'
import { WaveRowView } from './wave-row.presentational'
import {
  LOOM_BEFORE_WIDE_CLASS,
  WAVE_SECTION_HINT_CLASS,
  WAVE_SECTION_TITLE_CLASS,
} from './wave-panel.styles'

interface WaveSectionViewProps {
  appearance?: 'loom'
  layout?: 'list' | 'grid'
  title: string
  rows: WaveRow[]
  /**
   * How many rows the section HAS, when that differs from what it shows
   * (MAR-3191 R5). Awaiting QA previews three of twelve, and a heading that
   * counted the preview would be the panel telling a person there are three.
   */
  count?: number
  /**
   * One line explaining what this section is for (MAR-3194 R3), under the
   * heading. Optional and rendered only when given: every section that
   * existed before this prop draws exactly the markup it drew before.
   */
  hint?: string
  /** The section's own id, when a control outside its rows must name it. */
  id?: string
  /**
   * A control that belongs to this section, rendered after its rows -- inside
   * the section, so `aria-controls` names an ancestor of the control itself.
   */
  action?: ReactNode
  footer?: ReactNode
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
  appearance,
  layout = 'list',
  title,
  rows,
  count,
  hint,
  id,
  footer,
  action,
  inertReason,
  onOpen,
  disclosure,
}) => {
  if (rows.length === 0) return null
  const list = rows.map((row) => (
    <WaveRowView
      key={waveRowKey(row.entry)}
      row={row}
      appearance={appearance}
      layout={layout}
      inertReason={inertReason(row.entry)}
      onOpen={onOpen}
    />
  ))
  const content =
    layout === 'grid' ? (
      <div className={LOOM_BEFORE_WIDE_CLASS}>{list}</div>
    ) : (
      list
    )
  const heading = `${title} · ${count ?? rows.length}`
  const hintLine = hint ? (
    <p data-wave-hint={title} className={WAVE_SECTION_HINT_CLASS}>
      {hint}
    </p>
  ) : null

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
      {hintLine}
      {content}
    </details>
  ) : (
    <section id={id} aria-label={title} className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={WAVE_SECTION_TITLE_CLASS}>{heading}</h3>
        {action}
      </div>
      {hintLine}
      {content}
      {footer}
    </section>
  )
}
