import type { Tone } from '@convergence/ui'
import type { AttentionState } from './session.types'

/** The attentions that say something to a human: every one but `'none'`. */
export type LabelledAttention = Exclude<AttentionState, 'none'>

/**
 * What a session is doing, in the words every surface that draws one shares:
 * the sidebar's rows, the Activity feed's cards and folds, the status bar,
 * the rail, Mission Control's cards.
 */
export type SessionToneState =
  | 'waiting'
  | 'working'
  | 'finished'
  | 'failed'
  | 'unreachable'
  | 'idle'

/**
 * What a session's state says, as one of the five tones (R1, MAR-3617), and
 * the one place it is said (NAV-1): every other state map in the app is read
 * from this one, so a retuned tone changes every surface at once.
 *
 * - waiting on you (an approval or an answer) is warning, never red;
 * - working is info; finished is success; failed is danger;
 * - a machine we cannot reach is warning, with its own glyph: "we cannot
 *   see it", where danger says "it broke" (MAR-3051);
 * - idle says nothing: neutral.
 */
export const SESSION_STATE_TONE = {
  waiting: 'warning',
  working: 'info',
  finished: 'success',
  failed: 'danger',
  unreachable: 'warning',
  idle: 'neutral',
} as const satisfies Record<SessionToneState, Tone>

/**
 * A session's attention, in the state map's tones: the header's pill, the
 * rows' glyph, the cards' frames.
 *
 * Written over every labelled attention, so a new one is a compile error
 * here, not a state painted in no tone.
 */
export const ATTENTION_TONE = {
  'needs-approval': SESSION_STATE_TONE.waiting,
  'needs-input': SESSION_STATE_TONE.waiting,
  finished: SESSION_STATE_TONE.finished,
  failed: SESSION_STATE_TONE.failed,
  'host-unreachable': SESSION_STATE_TONE.unreachable,
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
