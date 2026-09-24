import type { HandoffRefusalStage } from '../../../src/shared/types/session-send.types'
export type { HandoffRefusalStage } from '../../../src/shared/types/session-send.types'

/** An unsent account handoff, distinct from a mid-turn input that should queue. */
export class HandoffRefusedError extends Error {
  readonly name = 'HandoffRefusedError'
  constructor(
    readonly stage: HandoffRefusalStage,
    message: string,
    readonly rule?: string,
  ) {
    super(message)
  }
}
