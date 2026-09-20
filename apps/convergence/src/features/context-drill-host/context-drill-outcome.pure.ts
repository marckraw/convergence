import type { DrillBeat } from '@/entities/context-drill'

/**
 * What the drill did to the conversation, in one line (MAR-3256 R4).
 *
 * Both figures or neither. A half-measured crossing -- "compacted: 76 % → ?"
 * -- is worse than the plain sentence: it invites the reader to believe a
 * number that was never taken. Providers that report no context usage (Cursor
 * today) and conversations compacted before their first measurement both land
 * on the plain one.
 */
export function describeDrillSuccess(
  before: number | null,
  after: number | null,
): string {
  if (before === null || after === null) return 'Context compacted.'
  return `Context compacted: ${before} % → ${after} %`
}

/**
 * The beat in the tense a sentence about it needs.
 *
 * `resuming` is the state machine's word; a person reads "waking up".
 */
export function describeDrillBeatWord(beat: DrillBeat): string {
  if (beat === 'sealing') return 'sealing'
  if (beat === 'compacting') return 'compacting'
  return 'waking up'
}

/**
 * The failure's headline, which names the beat rather than the error.
 *
 * Which beat stopped is the actionable half: a seal that was refused leaves
 * the conversation untouched, and a wake-up that failed leaves it compacted
 * and silent. The reason goes in the description below this line.
 */
export function describeDrillFailureTitle(beat: DrillBeat): string {
  return `The drill stopped while ${describeDrillBeatWord(beat)}`
}
