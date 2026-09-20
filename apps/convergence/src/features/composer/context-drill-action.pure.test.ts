import { describe, expect, it } from 'vitest'
import type { DrillDescription } from '@/entities/context-drill'
import {
  DRILL_COMPACTION_UNINTERRUPTIBLE,
  resolveContextDrillAction,
} from './context-drill-action.pure'

function description(patch: Partial<DrillDescription>): DrillDescription {
  return { eligible: true, offered: true, reason: null, beat: null, ...patch }
}

describe('resolveContextDrillAction (MAR-3256 R3)', () => {
  it('draws nothing for a conversation nothing is known about', () => {
    expect(resolveContextDrillAction(undefined, null).visible).toBe(false)
  })

  it('draws nothing on a seat that is not a mastermind', () => {
    const state = resolveContextDrillAction(
      description({
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
