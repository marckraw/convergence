import {
  parallelWorkStatus,
  type ParallelWorkCounts,
} from '@/shared/lib/parallel-work.pure'
import type { FC } from 'react'
import { Loader2 } from 'lucide-react'
import { Spinner, StatusPill } from '@convergence/ui'
import type {
  ActivitySignal,
  AttentionState,
  SessionStatus,
} from './session.types'
import {
  COMPACTING_CONTEXT_LABEL,
  isSessionCompacting,
} from './session-compacting.pure'
import { SessionBadge } from './session-badge.presentational'
import { ATTENTION_TONE, type LabelledAttention } from './session-tone.pure'

/**
 * The words of each attention that has something to say to a human: every
 * `AttentionState` except `'none'`, which by definition has nothing. Its tone
 * is the session's map (`ATTENTION_TONE`, R1).
 *
 * Written over `LabelledAttention`, an exclusion, so the maps are exhaustive
 * at the type level: a new attention value is a missing key here, and a
 * compile error, rather than a value that reaches the fallback below and
 * renders as nothing (MAR-2590).
 */
const labelMap = {
  'needs-approval': 'Needs Approval',
  'needs-input': 'Needs Input',
  finished: 'Finished',
  failed: 'Failed',
  'host-unreachable': 'Host Unreachable',
} satisfies Record<LabelledAttention, string>

/**
 * Whether an attention value has an entry of its own in the maps.
 *
 * A plain `labelMap[attention]` resolves the prototype chain, so an attention
 * value of `'toString'` or `'constructor'` -- and the session record carries
 * whatever the wire sent, not only what `AttentionState` allows -- returns an
 * inherited *function*, which is truthy, survives the fallback below and lands
 * as a React child. `Object.hasOwn` asks the only question that was ever
 * meant: is this one of ours?
 *
 * It gates both maps, and one guard is enough for both because `satisfies`
 * pins them to the same key set: a key in one and not the other is a compile
 * error, not a runtime miss.
 */
function isLabelledAttention(
  attention: AttentionState,
): attention is LabelledAttention {
  return Object.hasOwn(labelMap, attention)
}

interface AttentionIndicatorProps {
  parallelWork?: ParallelWorkCounts
  attention: AttentionState
  status: SessionStatus
  /**
   * The live activity, so a compacting conversation is not called Finished
   * (MAR-3288 R5). Optional only for callers that have no session record.
   */
  activity?: ActivitySignal
}

/**
 * The session header's state pill.
 *
 * It reads `status` and `attention` together because neither answers the
 * question alone. Before MAR-2590 it read only `attention`, and inferred "this
 * session is busy" from a label lookup that found nothing — so `'none'`, which
 * is a perfectly ordinary state meaning "nothing needs you", drew a spinning
 * "Running" over sessions that had been idle for days.
 *
 * Precedence, matching what Mission Control ratified for the Session Card
 * (`session-card-state.pure.ts`): blocked-on-a-human outranks a running turn,
 * live movement outranks a stale outcome flag, and everything else is quiet.
 */
export const AttentionIndicator: FC<AttentionIndicatorProps> = ({
  attention,
  status,
  parallelWork,
  activity,
}) => {
  // Compacting is a state, and it is busy (MAR-3288 R5). For its whole window
  // the record still reads the last turn's `completed` / `finished`, so this
  // pill said Finished right beside the grey "compacting context…" one.
  // Nothing can be waiting on a human here: a compaction runs no turn.
  if (isSessionCompacting({ activity }))
    return (
      <StatusPill leading={<Spinner size="xs" />}>
        {COMPACTING_CONTEXT_LABEL}
      </StatusPill>
    )
  const parallelLabel = parallelWorkStatus({ status, attention, parallelWork })
  if (parallelLabel)
    return (
      <StatusPill leading={<Loader2 className="size-3 opacity-50" />}>
        {parallelLabel}
      </StatusPill>
    )
  // Blocked on a human outranks the spinner, and it has to: the turn IS still
  // running while an approval prompt is up. Every provider's `setAttention`
  // patches attention alone and leaves the status where the turn put it
  // (`claude-code-provider.ts`, `codex-provider.ts`), so a spinner that won
  // here would hide the one pill Marcin has to act on.
  const isBlockedOnHuman =
    attention === 'needs-approval' || attention === 'needs-input'

  // The spinner is the session's status, and nothing else decides it.
  if (status === 'running' && !isBlockedOnHuman) {
    return <StatusPill leading={<Spinner size="xs" />}>Running</StatusPill>
  }

  // `'none'` is a real state, and silence is the honest rendering of it.
  if (attention === 'none') return null

  // The session record carries whatever the wire sent, so an attention value
  // outside `AttentionState` can arrive at runtime with the types satisfied.
  // On a session that is not running it is quiet for the same reason `'none'`
  // is: a pill nobody can explain sends a human to look at a session that may
  // need nothing from them. A running session still spins, and should -- the
  // spinner above is the status's to give, and an attention this build cannot
  // read takes nothing away from what the status plainly says.
  if (!isLabelledAttention(attention)) return null

  return (
    <StatusPill
      tone={ATTENTION_TONE[attention]}
      leading={<SessionBadge attention={attention} />}
    >
      {labelMap[attention]}
    </StatusPill>
  )
}
