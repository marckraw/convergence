import { parallelWorkStatus } from '@/shared/lib/parallel-work.pure'
import type { SessionSummary } from './session.types'
import {
  COMPACTING_CONTEXT_LABEL,
  isSessionCompacting,
} from './session-compacting.pure'
import {
  ATTENTION_WORDS,
  inputRequestWords,
} from './session-attention-words.pure'

export function formatSessionAttentionLabel(session: SessionSummary): string {
  // The words are the entity's one map, which the header's pill and the
  // request cards read too (CONV-3).
  if (session.attention === 'needs-approval') {
    return ATTENTION_WORDS['needs-approval']
  }

  if (session.attention === 'needs-input') {
    return inputRequestWords(session.attentionRequestKind)
  }

  if (session.attention === 'failed') {
    return ATTENTION_WORDS.failed
  }

  // The run is somebody else's machine's business; this is about the wire
  // between us and it (MAR-3051).
  if (session.attention === 'host-unreachable') {
    return ATTENTION_WORDS['host-unreachable']
  }

  // Busy, and saying so, before a stale `finished` can (MAR-3288 R5).
  if (isSessionCompacting(session)) return COMPACTING_CONTEXT_LABEL

  const parallel = parallelWorkStatus(session)
  if (parallel) return parallel

  if (session.attention === 'finished') {
    return ATTENTION_WORDS.finished
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
