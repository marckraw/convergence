import type { SpaceAttention, SpaceStatus } from '@/entities/space'
import { cn, toneLine, toneSoft } from '@convergence/ui'
export { spaceStatusLabels } from '@/entities/space'

export const spaceStatusOptions: SpaceStatus[] = [
  'exploring',
  'planned',
  'implementing',
  'reviewing',
  'ready-to-merge',
  'merged',
  'released',
  'parked',
  'discarded',
]

export const spaceAttentionOptions: SpaceAttention[] = [
  'none',
  'needs-you',
  'needs-decision',
  'blocked',
  'stale',
]

export const spaceAttentionLabels: Record<SpaceAttention, string> = {
  none: 'No attention',
  'needs-you': 'Needs you',
  'needs-decision': 'Needs decision',
  blocked: 'Blocked',
  stale: 'Stale',
}

/** An Attempt's or an Artifact's box on the board. */
export const rowCard =
  'rounded-lg border border-line-soft bg-surface/30 px-3 py-3'

/** A metric's box: Attempts, Artifacts, Updated. */
export const metricCard =
  'rounded-lg border border-line-soft bg-surface/30 px-3 py-2'

/** What synthesis or discovery suggests, on the info tint: a hint to accept or not. */
export const suggestionBox = cn(
  'space-y-3 rounded-lg border p-3',
  toneLine.info,
  toneSoft.info,
)

/** One suggested Artifact inside a suggestion box. */
export const suggestionRow =
  'flex min-w-0 items-start justify-between gap-3 rounded-md border border-line-soft bg-canvas/50 px-3 py-2'

/** One section of a synthesis's notes. */
export const noteCard =
  'rounded-md border border-line-soft bg-canvas/50 px-3 py-2'

/**
 * A caption over a control that names itself (aria-label): in a list of
 * rows each control carries its row's name, which a Field's label would
 * replace with the caption alone.
 */
export const rowCaption = 'text-2xs font-medium text-ink-muted'

/** A section's head: its label at the start, its action at the end. */
export const sectionHead = 'flex items-center justify-between gap-3'

/** A suggestion's top: its words, then its actions. */
export const rowTop = 'flex min-w-0 items-start justify-between gap-3'

/** The buttons at a row's end, kept whole. */
export const rowActions = 'flex shrink-0 items-center gap-2'
