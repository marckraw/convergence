import { ATTENTION_WORDS, inputRequestWords } from '@/entities/session'

/**
 * The words of the cards where the agent waits on you (CONV-8, MAR-3617):
 * one map that both a card's visible title and its accessible name read, so
 * the two can't drift apart. The words are the session entity's own
 * (`ATTENTION_WORDS`, CONV-3), which the header's pill and
 * `formatSessionAttentionLabel` (the sidebar, Mission Control) read too.
 */

export type ApprovalResolution =
  | 'pending'
  | 'approved'
  | 'denied'
  | null
  | undefined

/** An approval card's title: what it asks, or how it was answered. */
export function approvalCardTitle(resolution: ApprovalResolution): string {
  if (resolution === 'denied') return 'Denied'
  if (resolution === 'approved') return 'Approved'
  return ATTENTION_WORDS['needs-approval']
}

export type InputRequestKind =
  | 'plan'
  | 'form'
  | 'url'
  | 'choice'
  | 'text'
  | null
  | undefined

/** An input request card's title, by what it asks for. */
export function inputCardTitle(kind: InputRequestKind): string {
  return inputRequestWords(kind)
}

/**
 * The value of the button that submitted a request's form: its `name`d
 * decision (Approve, Decline, Deny…). Null when the form was submitted
 * another way (Enter in a field), so each form picks its own default.
 */
export function submitterValue(nativeEvent: {
  submitter?: unknown
}): string | null {
  const submitter = nativeEvent.submitter as { value?: unknown } | null
  return submitter && typeof submitter.value === 'string'
    ? submitter.value
    : null
}

/**
 * Who made a tool call or asked for an approval, when a subagent did: "↳ Inspect
 * the fixture (Explore)", or "↳ subagent" when it gave no description.
 */
export function agentAttributionLabel(
  attribution:
    | { description?: string | null; agentType?: string | null }
    | null
    | undefined,
): string {
  const description = attribution?.description?.trim()
  return description
    ? `↳ ${attribution?.description} (${attribution?.agentType ?? 'unknown'})`
    : '↳ subagent'
}
