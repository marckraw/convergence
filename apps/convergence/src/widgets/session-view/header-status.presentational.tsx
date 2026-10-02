import type { FC, Ref } from 'react'
import { Cloud, TriangleAlert } from 'lucide-react'
import { StatusPill, StatusPillButton, Tooltip } from '@convergence/ui'
import { AttentionIndicator, type SessionSummary } from '@/entities/session'
import type { HeaderSlot } from './conversation-header.container'

/**
 * A state in the conversation header's status row (CONV-3, MAR-3617): every
 * state in it is a StatusPill, or a StatusPillButton when it opens what it is
 * about, so the row is one height, one print and one tone map (R1). Both
 * headers, a project session's and a chat's, draw their states from here, so
 * a state never has two looks.
 */
export type HeaderStatusProps =
  /** Parallel work while it matters: live status that opens the panel (info: working). */
  | {
      kind: 'parallel-work'
      label: string
      expanded: boolean
      onToggle: () => void
      ref?: Ref<HTMLButtonElement>
    }
  /** The session runs on the remote execution host (info). */
  | { kind: 'remote' }
  /** What the session is doing now, in a few words (neutral); the full words on hover. */
  | { kind: 'activity'; label: string; testId: string }
  /** The session's worktree is gone from the disk (warning: it needs you). */
  | { kind: 'worktree-removed' }
  /** The session is archived (neutral), the same in both headers. */
  | { kind: 'archived' }

export const HeaderStatus: FC<HeaderStatusProps> = (props) => {
  switch (props.kind) {
    case 'parallel-work':
      return (
        <StatusPillButton
          ref={props.ref}
          tone="info"
          aria-expanded={props.expanded}
          onClick={props.onToggle}
        >
          {props.label}
        </StatusPillButton>
      )
    case 'remote':
      return (
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
    case 'activity':
      return (
        <Tooltip label={props.label}>
          <StatusPill className="max-w-48" data-testid={props.testId}>
            {props.label}
          </StatusPill>
        </Tooltip>
      )
    case 'worktree-removed':
      return (
        <StatusPill
          tone="warning"
          leading={<TriangleAlert aria-hidden className="size-3" />}
        >
          Worktree removed
        </StatusPill>
      )
    case 'archived':
      return <StatusPill>Archived</StatusPill>
  }
}

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
            node: <HeaderStatus kind="parallel-work" {...parallel} />,
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
            node: <HeaderStatus kind="archived" />,
          },
        ]
      : []),
  ]
}
