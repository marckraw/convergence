import { describe, expect, it } from 'vitest'
import type { DrillDescription } from './context-drill.types'
import {
  DRILL_COMPACTION_UNINTERRUPTIBLE,
  DRILL_RUN_LABEL,
  resolveContextDrillAction,
} from './context-drill-action.pure'

function description(patch: Partial<DrillDescription>): DrillDescription {
  return {
    seat: 'mastermind',
    eligible: true,
    offered: true,
    reason: null,
    beat: null,
    ...patch,
  }
}

describe('resolveContextDrillAction (MAR-3256 R3)', () => {
  it('draws nothing for a conversation nothing is known about', () => {
    expect(resolveContextDrillAction(undefined, null).visible).toBe(false)
  })

  // Amended by MAR-3287: this used to be "draws nothing on a seat that is
  // not a mastermind". Nothing is now drawn only for a conversation in no
  // crew; a crew seat with another role is drawn disabled (below).
  it('draws nothing for a conversation in no crew', () => {
    const state = resolveContextDrillAction(
      description({
        seat: 'none',
        eligible: false,
        offered: false,
        reason: "The drill only runs on a crew's mastermind conversation.",
      }),
      null,
    )

    expect(state.visible).toBe(false)
    expect(state.cancel.visible).toBe(false)
  })

  it('offers the drill on a ready mastermind conversation', () => {
    const state = resolveContextDrillAction(description({}), null)

    expect(state).toEqual({
      visible: true,
      enabled: true,
      label: 'Run the drill',
      reason: null,
      cancel: { visible: false, enabled: false, reason: null },
    })
  })

  it('draws the drill disabled with the backend’s own sentence when it is not offered now', () => {
    const state = resolveContextDrillAction(
      description({
        offered: false,
        reason: 'Wait for the active turn to finish before compacting context.',
      }),
      null,
    )

    expect(state.visible).toBe(true)
    expect(state.enabled).toBe(false)
    expect(state.reason).toBe(
      'Wait for the active turn to finish before compacting context.',
    )
    expect(state.cancel.visible).toBe(false)
  })

  it('names the beat while sealing, and offers a live Cancel', () => {
    const state = resolveContextDrillAction(description({}), 'sealing')

    expect(state).toEqual({
      visible: true,
      enabled: false,
      label: 'Sealing memory…',
      reason: null,
      cancel: { visible: true, enabled: true, reason: null },
    })
  })

  it('refuses to cancel the compaction, and says why', () => {
    const state = resolveContextDrillAction(description({}), 'compacting')

    expect(state.label).toBe('Compacting…')
    expect(state.cancel).toEqual({
      visible: true,
      enabled: false,
      reason: DRILL_COMPACTION_UNINTERRUPTIBLE,
    })
  })

  it('names the waking-up beat, and offers a live Cancel again', () => {
    const state = resolveContextDrillAction(description({}), 'resuming')

    expect(state.label).toBe('Waking up…')
    expect(state.cancel).toEqual({
      visible: true,
      enabled: true,
      reason: null,
    })
  })

  /**
   * A running routine holds the conversation mid-turn, so `describe` answers
   * "not offered" for the whole of it. If readiness outranked the beat, the
   * control — and its Cancel — would vanish the instant it started working.
   */
  it('keeps the control while a beat runs even though describe says not offered', () => {
    const state = resolveContextDrillAction(
      description({ offered: false, reason: 'Wait for the active turn' }),
      'sealing',
    )

    expect(state.visible).toBe(true)
    expect(state.cancel.visible).toBe(true)
  })

  it('keeps the control while a beat runs even before describe has answered', () => {
    expect(resolveContextDrillAction(undefined, 'sealing').visible).toBe(true)
  })

  it('quotes the refusal exactly as the backend spells it', () => {
    expect(DRILL_COMPACTION_UNINTERRUPTIBLE).toBe(
      'Compaction cannot be interrupted; it finishes on its own.',
    )
  })
})

describe('a crew seat that is not the mastermind (MAR-3287 R3)', () => {
  const ROLE_SENTENCE =
    "The drill runs on a crew's mastermind seat. Set this seat's role to Mastermind in the crew's settings (Mission Control)."

  function otherRole(reason: string | null): DrillDescription {
    return description({
      seat: 'other-role',
      eligible: false,
      offered: false,
      reason,
    })
  }

  it('draws Run the drill disabled, quoting the role sentence, with no Cancel', () => {
    expect(resolveContextDrillAction(otherRole(ROLE_SENTENCE), null)).toEqual({
      visible: true,
      enabled: false,
      label: DRILL_RUN_LABEL,
      reason: ROLE_SENTENCE,
      cancel: { visible: false, enabled: false, reason: null },
    })
  })

  it('decides from the seat, never from the sentence (R2)', () => {
    // A reason nobody would recognise: the control is still drawn disabled,
    // and it still quotes whatever the backend said.
    const state = resolveContextDrillAction(
      otherRole('Some entirely different wording.'),
      null,
    )
    expect(state.visible).toBe(true)
    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Some entirely different wording.')
  })

  it('a seat in no crew with the role sentence still draws nothing', () => {
    const state = resolveContextDrillAction(
      description({
        seat: 'none',
        eligible: false,
        offered: false,
        reason: ROLE_SENTENCE,
      }),
      null,
    )
    expect(state.visible).toBe(false)
  })

  it('a running beat outranks the seat', () => {
    const state = resolveContextDrillAction(otherRole(ROLE_SENTENCE), 'sealing')
    expect(state.visible).toBe(true)
    expect(state.label).toBe('Sealing memory…')
    expect(state.cancel).toEqual({ visible: true, enabled: true, reason: null })
  })
})
