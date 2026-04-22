import type { FC } from 'react'
import type { SessionSummary, NeedsYouDisposition } from '@/entities/session'
import { NeedsYouSection } from './needs-you-section.presentational'

interface NeedsYouSession {
  session: SessionSummary
  projectName: string
  summary: string
  priority: number
}

interface NeedsYouProps {
  waitingSessions: NeedsYouSession[]
  reviewSessions: NeedsYouSession[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onDismiss: (id: string) => void | Promise<void>
  onArchive: (id: string) => void | Promise<void>
}

export const NeedsYou: FC<NeedsYouProps> = ({
  waitingSessions,
  reviewSessions,
  activeSessionId,
  onSelect,
  onDismiss,
  onArchive,
}) => {
  const totalSessions = waitingSessions.length + reviewSessions.length
  if (totalSessions === 0) return null

  return (
    <div className="px-3 pb-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Needs You ({totalSessions})
      </p>
      <div className="space-y-3">
        {waitingSessions.length > 0 && (
          <NeedsYouSection
            title="Waiting on You"
            sessions={waitingSessions}
            activeSessionId={activeSessionId}
            onSelect={onSelect}
            onDismiss={onDismiss}
            onArchive={onArchive}
          />
        )}
        {reviewSessions.length > 0 && (
          <NeedsYouSection
            title="Needs Review"
            sessions={reviewSessions}
            activeSessionId={activeSessionId}
            onSelect={onSelect}
            onDismiss={onDismiss}
            onArchive={onArchive}
          />
        )}
      </div>
    </div>
  )
}

export function getNeedsYouAction(session: SessionSummary): {
  label: string
  disposition: NeedsYouDisposition
} {
  switch (session.attention) {
    case 'needs-approval':
    case 'needs-input':
      return { label: 'Snooze', disposition: 'snoozed' }
    case 'failed':
    case 'finished':
      return { label: 'Acknowledge', disposition: 'acknowledged' }
    default:
      return { label: 'Dismiss', disposition: 'snoozed' }
  }
}

export function buildNeedsYouSummary(session: SessionSummary): {
  summary: string
  priority: number
} | null {
  switch (session.attention) {
    case 'needs-approval':
      return { summary: 'Approval needed', priority: 0 }
    case 'needs-input':
      return { summary: 'Input needed', priority: 1 }
    case 'failed':
      return { summary: 'Session failed', priority: 2 }
    case 'finished':
      return { summary: 'Finished', priority: 3 }
    default:
      return null
  }
}
