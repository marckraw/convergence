import type { SessionQueuedInput } from '@/entities/session'
import { WAITS_FOR_COMPACTION_LABEL } from './composer-wait.pure'

/**
 * A waiting row says WHEN it goes, not merely that it is in a list
 * (MAR-2971, R1). "Queued" was true and useless: the four cards Marcin was
 * left with told him a state word and no future.
 */
const QUEUED_INPUT_STATE_LABELS: Record<SessionQueuedInput['state'], string> = {
  queued: 'Waiting for the next turn',
  dispatching: 'Dispatching',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/**
 * Why a queued input can't be cancelled any more (R2): a waiting or failed
 * one can, the rest are past the point where cancelling means anything.
 */
const CANCEL_QUEUED_UNAVAILABLE: Partial<
  Record<SessionQueuedInput['state'], string>
> = {
  dispatching: 'It is being delivered now.',
  sent: 'It was delivered already.',
  cancelled: 'It was cancelled already.',
}

const DELIVERY_MODE_LABELS: Record<SessionQueuedInput['deliveryMode'], string> =
  {
    'follow-up': 'Follow-up',
    steer: 'Steer',
    interrupt: 'Interrupt',
  }

/** One queued input as its card reads (CONV-30). */
export interface QueuedInputView {
  id: string
  /** How it goes: "Follow-up", "Steer", "Interrupt". */
  mode: string
  /** When it goes, or what became of it. */
  state: string
  /** Its words, or what it carries when it has none. */
  preview: string
  error: string | null
  /** Only a failed row that nothing has replaced yet can be sent again. */
  canDeliverNow: boolean
  /** Why it can't be cancelled, or null when it can. */
  cancelUnavailable: string | null
}

/** What a queued input says when it has no words of its own. */
export function queuedInputPreview(
  input: Pick<SessionQueuedInput, 'text' | 'attachmentIds'>,
): string {
  const text = input.text.trim()
  if (text) return text
  if (input.attachmentIds.length === 1) return '1 attachment'
  if (input.attachmentIds.length > 1)
    return `${input.attachmentIds.length} attachments`
  return 'Empty input'
}

/**
 * The queued inputs as their cards read (CONV-30). A waiting one says why it
 * waits when the conversation is compacting (MAR-3288 R7).
 *
 * Deliver now is offered only on a failed row, and only ONCE (MAR-2971 R2,
 * lap 5): a waiting row is already on its way, and a failed row that has been
 * replaced is already being carried again.
 */
export function queuedInputViews(
  inputs: readonly SessionQueuedInput[],
  waitsForCompaction: boolean,
): QueuedInputView[] {
  return inputs.map((input) => ({
    id: input.id,
    mode: DELIVERY_MODE_LABELS[input.deliveryMode] ?? input.deliveryMode,
    state:
      input.state === 'queued' && waitsForCompaction
        ? WAITS_FOR_COMPACTION_LABEL
        : QUEUED_INPUT_STATE_LABELS[input.state],
    preview: queuedInputPreview(input),
    error: input.error,
    canDeliverNow: input.state === 'failed' && !input.redeliveredBy,
    cancelUnavailable: CANCEL_QUEUED_UNAVAILABLE[input.state] ?? null,
  }))
}
