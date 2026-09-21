/**
 * The drill, as the renderer knows it (MAR-3256 R2).
 *
 * Structurally the backend's `DrillBeat` / `DrillOutcome` / `DrillDescription`
 * and the preload's `ContextDrill*Data` mirror of them. Declared here rather
 * than imported from `electron/` because the renderer may not reach into the
 * main process's tree, and named in the renderer's own words so the slices
 * above this one never have to spell `Data`.
 */
export type DrillBeat = 'sealing' | 'compacting' | 'resuming'

export type DrillOutcome =
  | { ok: true }
  | { ok: false; beat: DrillBeat; reason: string }

/**
 * Which of three seats a conversation sits on (MAR-3287 R1): in no crew, a
 * crew seat with another role (or none chosen), or a crew's mastermind.
 */
export type DrillSeat = 'none' | 'other-role' | 'mastermind'

export interface DrillDescription {
  /**
   * Which seat this is. What the popover draws is decided from this and
   * never from `reason`: the sentence is copy, and copy gets reworded.
   */
  seat: DrillSeat
  /** A crew's mastermind seat: the kind of conversation the drill is for. */
  eligible: boolean
  /** Eligible AND able to start right now. */
  offered: boolean
  reason: string | null
  beat: DrillBeat | null
}

export interface DrillChange {
  sessionId: string
  beat: DrillBeat | null
  reason?: string
}

export type DrillCancelResult = { ok: true } | { ok: false; reason: string }

/**
 * One finished run, kept so a surface that was not mounted when it ended can
 * still tell somebody about it.
 *
 * `seq` is identity, not ordering: a host records the number it has shown per
 * conversation, so a remount, a re-render, or a second run of the same shape
 * are all told apart without comparing outcomes for equality. It is assigned
 * by the store, because the store is the one place every run passes through.
 *
 * `before` is the context figure read at the moment `run` was called -- the
 * only moment it still exists. After a compaction nothing in the app
 * remembers what the conversation used to cost, so a toast that wanted to say
 * "76 % → 9 %" and did not capture the 76 here can never recover it.
 */
export interface DrillOutcomeRecord {
  seq: number
  outcome: DrillOutcome
  before: number | null
}
