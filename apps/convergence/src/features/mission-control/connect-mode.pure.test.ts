import { describe, expect, it } from 'vitest'
import {
  CONNECT_MODE_OFF,
  cancelConnectMode,
  connectModeHint,
  pickConnectCard,
  toggleConnectMode,
} from './connect-mode.pure'

const names: Record<string, string> = { fable: 'Fable', opus: 'Opus' }
const resolveName = (sessionId: string) => names[sessionId] ?? null

describe('connect mode', () => {
  it('arms and disarms from the toolbar', () => {
    const armed = toggleConnectMode(CONNECT_MODE_OFF)
    expect(armed).toEqual({ kind: 'awaiting-source' })
    expect(toggleConnectMode(armed)).toEqual(CONNECT_MODE_OFF)
  })

  /**
   * THE canary of the keyboard promise: the mouse route and the keyboard
   * route are the SAME machine, so they cannot drift. Both call `pickConnectCard`
   * with a session id — the machine cannot tell which device asked.
   *
   * Mutation that reds it: give the card's `onKeyDown` its own path that calls
   * `onOpen` instead of `onPick` (pinned on the rendered surface too).
   */
  it('draws the same pair however the two cards were picked', () => {
    const armed = toggleConnectMode(CONNECT_MODE_OFF)
    const afterSource = pickConnectCard(armed, 'fable')
    expect(afterSource.drawn).toBeNull()
    expect(afterSource.state).toEqual({
      kind: 'awaiting-target',
      sourceSessionId: 'fable',
    })

    const afterTarget = pickConnectCard(afterSource.state, 'opus')
    expect(afterTarget.drawn).toEqual({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
    })
    // The mode ends with the pair: a mode still armed behind an open draft
    // would take the next click meant for the panel.
    expect(afterTarget.state).toEqual(CONNECT_MODE_OFF)
  })

  /**
   * A self-loop is refused by the engine (R6), so offering it as a gesture
   * would teach a shape that always fails. The second pick on the same card
   * reads as "no, not that one".
   */
  it('un-picks rather than drawing a conversation onto itself', () => {
    const armed = pickConnectCard(toggleConnectMode(CONNECT_MODE_OFF), 'fable')
    const again = pickConnectCard(armed.state, 'fable')

    expect(again.drawn).toBeNull()
    expect(again.state).toEqual({ kind: 'awaiting-source' })
  })

  it('ignores picks while the mode is off', () => {
    expect(pickConnectCard(CONNECT_MODE_OFF, 'fable')).toEqual({
      state: CONNECT_MODE_OFF,
      drawn: null,
    })
  })

  it('backs out one step at a time', () => {
    const picked = pickConnectCard(
      toggleConnectMode(CONNECT_MODE_OFF),
      'fable',
    ).state

    const backToSource = cancelConnectMode(picked)
    expect(backToSource).toEqual({ kind: 'awaiting-source' })
    expect(cancelConnectMode(backToSource)).toEqual(CONNECT_MODE_OFF)
  })

  it('names the chosen card, because "source selected" is uncheckable', () => {
    expect(connectModeHint(CONNECT_MODE_OFF, resolveName)).toBeNull()
    expect(connectModeHint({ kind: 'awaiting-source' }, resolveName)).toContain(
      'Esc cancels',
    )

    const hint = connectModeHint(
      { kind: 'awaiting-target', sourceSessionId: 'fable' },
      resolveName,
    )
    expect(hint).toContain('Fable selected')
    expect(hint).toContain('Esc cancels')
  })

  it('still says something about a card whose name is gone', () => {
    const hint = connectModeHint(
      { kind: 'awaiting-target', sourceSessionId: 'vanished' },
      resolveName,
    )

    expect(hint).not.toContain('null')
    expect(hint).toContain('selected')
  })
})
