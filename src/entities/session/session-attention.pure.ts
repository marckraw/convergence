import type { SessionSummary } from './session.types'

export function formatSessionAttentionLabel(session: SessionSummary): string {
  if (session.attention === 'needs-approval') {
    return 'Approval needed'
  }

  if (session.attention === 'needs-input') {
    switch (session.attentionRequestKind) {
      case 'question':
        return 'Question needs answer'
      case 'plan':
        return 'Plan review needed'
      case 'form':
        return 'Form input needed'
      case 'url':
        return 'URL confirmation needed'
      default:
        return 'Input needed'
    }
  }

  if (session.attention === 'failed') {
    return 'Session failed'
  }

  if (session.attention === 'finished') {
    return 'Finished'
  }

  return 'No attention'
}

export function summarizeAttentionRequests(sessions: SessionSummary[]): string {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const label = compactAttentionLabel(session)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`)
    .join(', ')
}

function compactAttentionLabel(session: SessionSummary): string {
  if (session.attention === 'needs-approval') return 'approval'
  if (session.attention !== 'needs-input') return 'attention item'

  switch (session.attentionRequestKind) {
    case 'question':
      return 'question'
    case 'plan':
      return 'plan'
    case 'form':
      return 'form'
    case 'url':
      return 'URL'
    default:
      return 'input'
  }
}
