import type {
  HarnessEvent,
  HarnessFact,
} from '../../../src/shared/types/harness-facts.types'
import { readClaudeHarnessFact } from '../provider/claude-code/claude-harness.pure'
import { claudeRecord } from '../provider/claude-code/claude-evidence.pure'

const placeholderSources = {
  'harness.hook': { type: 'system', subtype: 'hook_response' },
  'harness.retry': { type: 'system', subtype: 'api_retry' },
  'harness.compaction': { type: 'system', subtype: 'compact_boundary' },
  'harness.denial': { type: 'system', subtype: 'permission_denied' },
  'harness.rateLimit': { type: 'rate_limit_event' },
  'harness.init': { type: 'system', subtype: 'init' },
} satisfies Record<HarnessFact['kind'], unknown>

/** The row type survives envelope truncation; its missing fields remain unknown. */
export function readHarnessFactRow(
  type: string,
  payload: unknown,
  at: string,
  subtype?: string | null,
): HarnessEvent['fact'] | null {
  const record = claudeRecord(payload)
  if (record?.truncated === true) {
    const fact = readClaudeHarnessFact(
      Object.hasOwn(placeholderSources, type)
        ? placeholderSources[type as HarnessFact['kind']]
        : { type, subtype },
      at,
    )
    if (!fact) return null
    if (fact.kind === 'harness.retry')
      return { kind: fact.kind, phase: 'unknown', truncated: true, at }
    if (fact.kind === 'harness.hook')
      return { ...fact, phase: 'unknown', truncated: true }
    return { ...fact, truncated: true }
  }
  if (
    record?.kind === type &&
    (type.startsWith('harness.') || type === 'process.ended')
  )
    return record as unknown as HarnessEvent['fact']
  return readClaudeHarnessFact(payload, at)
}
