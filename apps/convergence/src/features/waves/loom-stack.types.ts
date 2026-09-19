import type { UIEvent } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import type { LoomHorse } from './loom-horses.pure'
import type { LoomIssueDetail } from './loom-detail.pure'
import type { LoomSheets } from './loom-sheets.pure'
import type { LoomSheet } from './wave-panel-sheet.pure'
import type { SessionSummary } from '@/entities/session'
import type { WaveHeader } from './wave-sections.pure'

/**
 * What a stack hands the open sheet so it can render a detail.
 *
 * Typed with the conversation the app actually has (lap 2, H): `unknown`
 * here bought nothing and cost two casts at the container's seam, where a
 * cast is exactly the place a wrong type would stop being caught.
 */
export interface LoomSheetDetail {
  view: LoomIssueDetail<SessionSummary>
  onClose: () => void
  onOpenConversation: (session: SessionSummary) => void
  closeRef?: (element: HTMLButtonElement | null) => void
}

/**
 * What both of Loom's shapes are handed (MAR-3189 R1).
 *
 * One props type for compact and expanded, so the two cannot drift into
 * needing different facts -- they are the same panel at two sizes.
 */
export interface LoomStackProps {
  sheets: LoomSheets
  /** The bound crews' horse seats (MAR-3191 R1) — the same list in both shapes. */
  horses: readonly LoomHorse[]
  /** Awaiting QA's reveal, held by the container so a fold cannot lose it. */
  qaExpanded: boolean
  onToggleQa: () => void
  /** Opens a seat's conversation; the panel never sends (R6). */
  onOpenSeat?: (sessionId: string) => void
  /** Selects the Next sheet in place, for an idle seat's queued work. */
  onShowNext?: () => void
  /** Reads an issue in place (MAR-3195); the key is all it needs. */
  onShowDetail?: (entry: WorkLedgerEntry) => void
  /** Reads an issue in place (MAR-3195); absent when nothing is open. */
  detail?: LoomSheetDetail | null
  /**
   * Escape, decided by the container (MAR-3195 R5).
   *
   * The ordering is the rule: with a detail open, Escape closes THAT and
   * Loom stays as it is; only the next one folds. Deciding it here rather
   * than in each shape is what keeps the two from disagreeing.
   */
  onEscape?: () => void
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
