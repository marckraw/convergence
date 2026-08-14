import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MISSION_CONTROL_VIEW,
  parseMissionControlView,
  serializeMissionControlView,
} from './mission-control-view.pure'
import { SESSION_CARD_ORDER_PRESETS } from './session-card-order.pure'

describe('parseMissionControlView', () => {
  it('returns the default room for nothing stored', () => {
    expect(parseMissionControlView(null)).toEqual(DEFAULT_MISSION_CONTROL_VIEW)
    expect(parseMissionControlView('')).toEqual(DEFAULT_MISSION_CONTROL_VIEW)
  })

  it('returns the default room for junk', () => {
    expect(parseMissionControlView('not json')).toEqual(
      DEFAULT_MISSION_CONTROL_VIEW,
    )
    expect(parseMissionControlView('null')).toEqual(
      DEFAULT_MISSION_CONTROL_VIEW,
    )
    expect(parseMissionControlView('42')).toEqual(DEFAULT_MISSION_CONTROL_VIEW)
    expect(parseMissionControlView('["working"]')).toEqual(
      DEFAULT_MISSION_CONTROL_VIEW,
    )
  })

  it('reads back a full stored view', () => {
    const stored = {
      order: 'working-first' as const,
      states: ['working' as const, 'failed' as const],
      projectIds: ['project-a'],
      providerIds: ['codex'],
    }

    expect(parseMissionControlView(JSON.stringify(stored))).toEqual(stored)
  })

  it('round-trips every ordering preset', () => {
    for (const order of SESSION_CARD_ORDER_PRESETS) {
      const view = { ...DEFAULT_MISSION_CONTROL_VIEW, order }
      expect(
        parseMissionControlView(serializeMissionControlView(view)),
      ).toEqual(view)
    }
  })

  it('falls back to the default order for a preset it no longer knows', () => {
    expect(parseMissionControlView('{"order":"by-vibes"}').order).toBe(
      DEFAULT_MISSION_CONTROL_VIEW.order,
    )
  })

  it('drops states it no longer knows and keeps the canonical order', () => {
    expect(
      parseMissionControlView(
        '{"states":["failed","made-up","working",7,null]}',
      ).states,
    ).toEqual(['working', 'failed'])
  })

  it('keeps only string ids in the pickers', () => {
    const parsed = parseMissionControlView(
      '{"projectIds":["a",1,null,"b"],"providerIds":"codex"}',
    )

    expect(parsed.projectIds).toEqual(['a', 'b'])
    expect(parsed.providerIds).toEqual([])
  })

  it('never restores a search query', () => {
    const parsed = parseMissionControlView('{"query":"tunnel"}')
    expect(parsed).toEqual(DEFAULT_MISSION_CONTROL_VIEW)
    expect('query' in parsed).toBe(false)
  })

  it('defaults every dimension a partial value leaves out', () => {
    expect(parseMissionControlView('{"order":"recent-first"}')).toEqual({
      ...DEFAULT_MISSION_CONTROL_VIEW,
      order: 'recent-first',
    })
  })
})

describe('serializeMissionControlView', () => {
  it('round-trips a narrowed room', () => {
    const view = {
      order: 'by-project' as const,
      states: ['needs-you' as const],
      projectIds: ['project-a', 'global'],
      providerIds: ['claude-code'],
    }

    expect(parseMissionControlView(serializeMissionControlView(view))).toEqual(
      view,
    )
  })

  it('round-trips the default room', () => {
    expect(
      parseMissionControlView(
        serializeMissionControlView(DEFAULT_MISSION_CONTROL_VIEW),
      ),
    ).toEqual(DEFAULT_MISSION_CONTROL_VIEW)
  })
})
