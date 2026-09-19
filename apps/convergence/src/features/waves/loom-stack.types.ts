import type { ReactNode, UIEvent } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import type { LoomHorse } from './loom-horses.pure'
import type { LoomIssueDetail } from './loom-detail.pure'
import type { LoomSheets } from './loom-sheets.pure'
import type { LoomSheet } from './wave-panel-sheet.pure'
import type { SessionSummary } from '@/entities/session'
import type { WaveHeader } from './wave-sections.pure'
import type { LoomCrewOption } from './wave-panel-crew.pure'

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
 * Which ledger this is (MAR-3189), and the choice of crew when there is one
 * (MAR-3225 R3).
 *
 * `text` is the whole line either way; `picker` is present only when more
 * than one crew reads a tracker, and then it draws the crew's name as a
 * control while the rest of the line stays text.
 */
export interface LoomSubline {
  text: string
  picker: {
    options: readonly LoomCrewOption[]
    selectedId: string
    onSelect: (crewId: string) => void
  } | null
}

/**
 * What both of Loom's shapes are handed (MAR-3189 R1).
 *
 * One props type for compact and expanded, so the two cannot drift into
 * needing different facts -- they are the same panel at two sizes.
 */
export interface LoomStackProps {
  sheets: LoomSheets
  /**
   * The board's clock (MAR-3192 R2).
   *
   * Before's window is judged against it, and the title's count comes from
   * the same call the sheet does -- so both shapes and the heading above
   * them are always looking at one instant.
   */
  now: number
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
  /**
   * The Refresh control beside the tracker's line (MAR-3227 R6), or null
   * where it has nothing honest to do: no crew on screen, or the tracker in
   * an outage the header is already naming.
   */
  refresh?: ReactNode
  /** `convergence development · All waves` -- which ledger this is. */
  subline: LoomSubline
  open: LoomSheet
  onSelectSheet: (sheet: LoomSheet) => void
  inertReason: (entry: WorkLedgerEntry) => string | null
  onOpen: (entry: WorkLedgerEntry) => void
  /** The open sheet's scroller, so its offset survives a fold (R3). */
  bodyRef?: (element: HTMLDivElement | null) => void
  onBodyScroll?: (event: UIEvent<HTMLDivElement>) => void
  /** The open sheet's title, so focus can come back to it after a fold (R7). */
  titleRef?: (element: HTMLButtonElement | null) => void
  /** Opens the guide (MAR-3201 R9); the panel itself does not change. */
  onOpenGuide: () => void
  /**
   * The control that opened the guide, so closing can put focus back on it
   * (MAR-3201 R6). Whichever shell is mounted registers its own.
   */
  guideRef?: (element: HTMLButtonElement | null) => void
}
