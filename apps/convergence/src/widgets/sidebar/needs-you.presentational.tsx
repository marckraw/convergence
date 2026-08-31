import type { FC } from 'react'
import {
  formatSessionAttentionLabel,
  type NeedsYouDisposition,
  type SessionSummary,
} from '@/entities/session'
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
  pulsingSessionIds?: Readonly<Record<string, true>>
  onSelect: (id: string) => void
  onDismiss: (id: string) => void | Promise<void>
  onArchive: (id: string) => void | Promise<void>
}

export const NeedsYou: FC<NeedsYouProps> = ({
  waitingSessions,
  reviewSessions,
  activeSessionId,
  pulsingSessionIds,
  onSelect,
  onDismiss,
  onArchive,
}) => {
  const totalSessions = waitingSessions.length + reviewSessions.length
  if (totalSessions === 0) return null

  return (
    <div className="px-3 pb-2">
      <div className="space-y-2">
        {waitingSessions.length > 0 && (
          <NeedsYouSection
            title="Waiting on You"
            sessions={waitingSessions}
            activeSessionId={activeSessionId}
            pulsingSessionIds={pulsingSessionIds}
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
            pulsingSessionIds={pulsingSessionIds}
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
      return { summary: formatSessionAttentionLabel(session), priority: 0 }
    case 'needs-input':
      return {
        summary: formatSessionAttentionLabel(session),
        priority: priorityForInputRequest(session),
      }
    case 'failed':
      return { summary: formatSessionAttentionLabel(session), priority: 20 }
    case 'finished':
      return { summary: formatSessionAttentionLabel(session), priority: 30 }
    default:
      return null
  }
}

function priorityForInputRequest(session: SessionSummary): number {
  switch (session.attentionRequestKind) {
    case 'plan':
      return 1
    case 'question':
      return 2
    case 'form':
      return 3
    case 'url':
      return 4
    default:
      return 5
  }
}
