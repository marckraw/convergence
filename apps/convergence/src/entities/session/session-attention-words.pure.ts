import type { AttentionRequestKind } from './session.types'
import type { LabelledAttention } from './session-tone.pure'

/**
 * The words of each attention that says something to a human (CONV-3, R10).
 * The header's pill, the request cards in the transcript and
 * `formatSessionAttentionLabel` (the sidebar, Mission Control, the status
 * bar) all read this one map, so one state has one name, in sentence case:
 * the pill used to say "Needs Approval" beside a card saying "Approval
 * needed".
 *
 * Written over every labelled attention, so a new one is a compile error
 * here, not a state with no words.
 */
export const ATTENTION_WORDS = {
  'needs-approval': 'Approval needed',
  'needs-input': 'Input needed',
  finished: 'Finished',
  failed: 'Failed',
  'host-unreachable': 'Host unreachable',
} as const satisfies Record<LabelledAttention, string>

/**
 * What an input request asks for, when the agent said what kind: the words
 * of `needs-input`, narrowed. Any other kind says `needs-input`'s own words.
 */
const INPUT_REQUEST_WORDS = {
  question: 'Question needs answer',
  plan: 'Plan review needed',
  form: 'Form input needed',
  url: 'URL confirmation needed',
} as const satisfies Partial<Record<AttentionRequestKind, string>>

/**
 * The words for an input request of this kind. `Object.hasOwn`, so a kind
 * the wire sent and this build doesn't know (or `'toString'`) says "Input
 * needed" rather than nothing.
 */
export function inputRequestWords(kind: string | null | undefined): string {
  return kind && Object.hasOwn(INPUT_REQUEST_WORDS, kind)
    ? INPUT_REQUEST_WORDS[kind as keyof typeof INPUT_REQUEST_WORDS]
    : ATTENTION_WORDS['needs-input']
}
