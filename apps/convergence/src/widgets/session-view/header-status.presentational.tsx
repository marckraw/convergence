import type { FC, Ref } from 'react'
import { Cloud, TriangleAlert } from 'lucide-react'
import { StatusPill, StatusPillButton, Tooltip } from '@convergence/ui'
import { AttentionIndicator, type SessionSummary } from '@/entities/session'
import type { HeaderSlot } from './conversation-header.container'

/**
 * The conversation header's status row (CONV-3, MAR-3617): every state in it
 * is a StatusPill, or a StatusPillButton when it opens what it is about, so
 * the row is one height, one print and one tone map (R1). Both headers, a
 * project session's and a chat's, draw their states from here, so a state
 * never has two looks.
 */

/** Parallel work while it matters: live status that opens the panel (info: working). */
export const ParallelWorkStatus: FC<{
  label: string
  expanded: boolean
  onToggle: () => void
  ref?: Ref<HTMLButtonElement>
}> = ({ label, expanded, onToggle, ref }) => (
  <StatusPillButton
    ref={ref}
    tone="info"
    aria-expanded={expanded}
    onClick={onToggle}
  >
    {label}
  </StatusPillButton>
)

/** The session runs on the remote execution host (info). */
export const RemoteStatus: FC = () => (
  <Tooltip label="This session runs on the remote execution host">
    <StatusPill
      tone="info"
      leading={<Cloud aria-hidden className="size-3" />}
      data-testid="session-remote-indicator"
    >
      Remote
    </StatusPill>
  </Tooltip>
)

/** What the session is doing now, in a few words (neutral); the full words on hover. */
export const ActivityStatus: FC<{ label: string; testId: string }> = ({
  label,
  testId,
}) => (
  <Tooltip label={label}>
    <StatusPill className="max-w-48" data-testid={testId}>
      {label}
    </StatusPill>
  </Tooltip>
)

/** The session's worktree is gone from the disk (warning: it needs you). */
export const WorktreeRemovedStatus: FC = () => (
  <StatusPill
    tone="warning"
    leading={<TriangleAlert aria-hidden className="size-3" />}
  >
    Worktree removed
  </StatusPill>
)

/** The session is archived (neutral), the same in a chat's header and a project session's. */
export const ArchivedStatus: FC = () => <StatusPill>Archived</StatusPill>

/**
 * The states every conversation header leads with, a project session's and a
 * chat's alike: Parallel work while it matters (its history is in View), the
 * attention pill, and Archived. Each header adds its own after them.
 */
export function leadingStatusSlots({
  session,
  parallel,
}: {
  session: Pick<
    SessionSummary,
    'parallelWork' | 'attention' | 'status' | 'activity' | 'archivedAt'
  >
  /** Parallel work's pill, while there is work to show; null otherwise. */
  parallel: {
    label: string
    expanded: boolean
    onToggle: () => void
    ref: Ref<HTMLButtonElement>
  } | null
}): HeaderSlot[] {
  return [
    ...(parallel
      ? [
          {
            id: 'parallel-work',
            side: 'left' as const,
            group: 'status' as const,
            node: <ParallelWorkStatus {...parallel} />,
          },
        ]
      : []),
    {
      id: 'attention',
      side: 'left',
      group: 'status',
      node: (
        <AttentionIndicator
          parallelWork={session.parallelWork}
          attention={session.attention}
          status={session.status}
          activity={session.activity}
        />
      ),
    },
    ...(session.archivedAt
      ? [
          {
            id: 'archived',
            side: 'left' as const,
            group: 'status' as const,
            node: <ArchivedStatus />,
          },
        ]
      : []),
  ]
}
