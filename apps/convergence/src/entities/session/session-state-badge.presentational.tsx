import type { FC } from 'react'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { isSessionCompacting } from './session-compacting.pure'
import type { SessionSummary } from './session.types'

/** What a session's badge reads off the record, and nothing more. */
export type SessionStateBadgeSession = Pick<
  SessionSummary,
  'attention' | 'status' | 'parallelWork' | 'activity'
>

interface SessionStateBadgeProps {
  /** Absent when the surface has no record for the row (an unknown attempt). */
  session: SessionStateBadgeSession | null | undefined
  className?: string
}

/**
 * Adapter: the session entity's badge. It takes the SESSION, not its fields,
 * and is the only way a surface draws a session's state glyph (MAR-3288 lap 2
 * item B).
 *
 * `SessionBadge` lives in `shared` and cannot know what compacting looks like
 * on a session record, so it takes a `compacting` prop. Eight sites once
 * each had to remember that prop; forgetting it type-checked, rendered a
 * green "finished" check on a busy conversation, and left every test green.
 * Here the prop is answered once, from `isSessionCompacting`, and the sites no
 * longer have a prop to forget. `session-badge-sites.test.ts` keeps the raw
 * `SessionBadge` from being drawn anywhere outside this entity.
 */
export const SessionStateBadge: FC<SessionStateBadgeProps> = ({
  session,
  className,
}) => (
  <SessionBadge
    compacting={isSessionCompacting(session)}
    attention={session?.attention ?? 'none'}
    status={session?.status}
    parallelWork={session?.parallelWork}
    className={className}
  />
)
