import type { UIEvent } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import type { LoomSheets } from './loom-sheets.pure'
import type { LoomSheet } from './wave-panel-sheet.pure'
import type { WaveHeader } from './wave-sections.pure'

/**
 * What both of Loom's shapes are handed (MAR-3189 R1).
 *
 * One props type for compact and expanded, so the two cannot drift into
 * needing different facts -- they are the same panel at two sizes.
 */
export interface LoomStackProps {
  sheets: LoomSheets
  header: WaveHeader
  /** `convergence development · All waves` -- which ledger this is. */
  subline: string
  open: LoomSheet
  onSelectSheet: (sheet: LoomSheet) => void
  inertReason: (entry: WorkLedgerEntry) => string | null
  onOpen: (entry: WorkLedgerEntry) => void
  /** The open sheet's scroller, so its offset survives a fold (R3). */
  bodyRef?: (element: HTMLDivElement | null) => void
  onBodyScroll?: (event: UIEvent<HTMLDivElement>) => void
  /** The open sheet's title, so focus can come back to it after a fold (R7). */
  titleRef?: (element: HTMLButtonElement | null) => void
}
