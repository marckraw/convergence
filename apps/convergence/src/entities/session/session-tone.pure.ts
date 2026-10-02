import type { Tone } from '@convergence/ui'
import type { AttentionState } from './session.types'

/** The attentions that say something to a human: every one but `'none'`. */
export type LabelledAttention = Exclude<AttentionState, 'none'>

/**
 * What a session's attention says, as one of the five tones (R1, MAR-3617).
 * This entity owns the map, so every surface paints a state alike: the
 * header's pill, the rows' glyph, the cards.
 *
 * - waiting on you (an approval or an answer) is warning, never red;
 * - finished is success; failed is danger;
 * - a machine we cannot reach is warning, with its own glyph: "we cannot
 *   see it", where danger says "it broke" (MAR-3051).
 *
 * Written over every labelled attention, so a new one is a compile error
 * here, not a state painted in no tone.
 */
export const ATTENTION_TONE = {
  'needs-approval': 'warning',
  'needs-input': 'warning',
  finished: 'success',
  failed: 'danger',
  'host-unreachable': 'warning',
} as const satisfies Record<LabelledAttention, Tone>

/**
 * The tone of an attention, or null for `'none'` and for anything the wire
 * sent that this build doesn't know. `Object.hasOwn`, so `'toString'` is not
 * one of ours.
 */
export function attentionTone(attention: string): Tone | null {
  return Object.hasOwn(ATTENTION_TONE, attention)
    ? ATTENTION_TONE[attention as LabelledAttention]
    : null
}
