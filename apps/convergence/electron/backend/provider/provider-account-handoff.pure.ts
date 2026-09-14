export type HandoffRefusalStage =
  | 'source-busy'
  | 'busy'
  | 'stale-and-busy'
  | 'missing-thread'
  | 'not-eligible'

/** An unsent account handoff, distinct from a mid-turn input that should queue. */
export class HandoffRefusedError extends Error {
  readonly name = 'HandoffRefusedError'
  constructor(
    readonly stage: HandoffRefusalStage,
    message: string,
  ) {
    super(message)
  }
}
