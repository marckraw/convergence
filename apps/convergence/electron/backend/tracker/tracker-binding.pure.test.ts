import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  TrackerInputTooLongError,
  DEFAULT_TRACKER_STATUS_MAP,
  normalizeTrackerBinding,
  trackerLabelGroupName,
} from './tracker-binding.pure'
import type { TrackerBinding } from './tracker.types'

describe('MAR-3084 R3: a binding holds nothing secret', () => {
  it('has no token or key field (type level)', () => {
    expectTypeOf<keyof TrackerBinding>().toEqualTypeOf<
      | 'autoDispatch'
      | 'kind'
      | 'projectId'
      | 'labelPrefix'
      | 'wavePrefix'
      | 'statusMap'
    >()
    expectTypeOf<TrackerBinding>().not.toHaveProperty('apiKey')
    expectTypeOf<TrackerBinding>().not.toHaveProperty('token')
    expectTypeOf<TrackerBinding>().not.toHaveProperty('key')
  })

  it('drops anything else it is handed, a key included', () => {
    const binding = normalizeTrackerBinding({
      projectId: ' project-1 ',
      apiKey: 'lin_api_fixture',
    } as never)
    expect(binding).toEqual({
      autoDispatch: false,
      kind: 'linear',
      projectId: 'project-1',
      labelPrefix: 'horse:',
      wavePrefix: 'wave:',
      statusMap: DEFAULT_TRACKER_STATUS_MAP,
    })
  })
})

describe('the binding door', () => {
  it('refuses a missing project, an unknown kind and an unknown status', () => {
    expect(() => normalizeTrackerBinding({ projectId: ' ' })).toThrow(
      'project id',
    )
    expect(() =>
      normalizeTrackerBinding({ kind: 'jira', projectId: 'p' }),
    ).toThrow('Unknown tracker kind')
    expect(() =>
      normalizeTrackerBinding({
        projectId: 'p',
        statusMap: { Done: 'finished' },
      }),
    ).toThrow('status map')
    expect(() =>
      normalizeTrackerBinding({ projectId: 'p', labelPrefix: ':' }),
    ).toThrow('label group')
  })

  it('names the group a prefix spells', () => {
    expect(trackerLabelGroupName('horse:')).toBe('horse')
    expect(trackerLabelGroupName(' seat ')).toBe('seat')
  })
})

describe('MAR-3084 lap 2, F: bounded strings', () => {
  it('refuses a project id or a prefix over 128 characters, typed', () => {
    const long = 'x'.repeat(129)
    for (const input of [
      { projectId: long },
      { projectId: 'p', labelPrefix: long },
      { projectId: 'p', wavePrefix: long },
    ]) {
      expect(() => normalizeTrackerBinding(input)).toThrow(
        TrackerInputTooLongError,
      )
    }
    expect(
      normalizeTrackerBinding({ projectId: 'x'.repeat(128) }).projectId,
    ).toHaveLength(128)
  })
})
