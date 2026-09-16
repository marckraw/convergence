import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CREW_MEMBER_SEAT,
  type SessionCrewMember,
} from '@/entities/session-crew'
import {
  batonNameHelper,
  formatRoleCardCount,
  hostLabel,
  isLocalHost,
  laneLabel,
  refusalKeptLine,
  seatDisplayName,
  seatHostId,
  seatRowAccessibleName,
  seatSourceLabel,
} from './seat-display.pure'

const resident: SessionCrewMember = {
  ...DEFAULT_CREW_MEMBER_SEAT,
  sessionId: 's1',
  batonName: 'opus',
  canvasX: null,
  canvasY: null,
}
const recipe: SessionCrewMember = {
  ...resident,
  sessionId: null,
  batonName: 'glm',
  kind: 'dynamic',
  providerId: 'pi',
  model: 'glm-5',
  hostPolicy: 'lm',
}
const endpoints = [{ id: 'lm', label: 'little-monster' }]

describe('seat display (MAR-3118)', () => {
  it('names a host: this Mac, an endpoint label, or the bare id', () => {
    expect(hostLabel(null, endpoints)).toBe('This Mac')
    expect(hostLabel('local', endpoints)).toBe('This Mac')
    expect(hostLabel('lm', endpoints)).toBe('little-monster')
    expect(hostLabel('gone', endpoints)).toBe('gone')
  })

  it('reads no host and "local" as this Mac, and an endpoint as remote', () => {
    expect([null, '', 'local', 'lm'].map(isLocalHost)).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  it('names a lane, with no lane chosen reading as the default', () => {
    expect(
      [null, 'main', 'own-worktree'].map((lane) =>
        laneLabel(lane as SessionCrewMember['lanePolicy']),
      ),
    ).toEqual(['default', 'main', 'own worktree'])
  })

  it('reads an unnamed seat as "unnamed" rather than blank', () => {
    expect(seatDisplayName(resident)).toBe('opus')
    expect(seatDisplayName({ ...resident, batonName: null })).toBe('unnamed')
  })

  it('takes a resident host from its conversation and a recipe host from its policy', () => {
    expect(seatHostId(resident, 'lm')).toBe('lm')
    expect(seatHostId({ ...recipe, hostPolicy: 'lm' }, 'local')).toBe('lm')
  })

  it('says where a seat comes from', () => {
    expect(seatSourceLabel(resident, 'Horse Executor Opus')).toBe(
      'Horse Executor Opus',
    )
    expect(seatSourceLabel(recipe, null)).toBe('recipe · glm-5')
    expect(
      seatSourceLabel({ ...resident, conversationMissing: true }, null),
    ).toBe('conversation gone')
  })

  it('puts every fact of a closed row into its accessible name', () => {
    expect(
      seatRowAccessibleName({
        member: { ...recipe, lanePolicy: 'own-worktree', wipLimit: 2 },
        source: 'recipe · glm-5',
        host: 'little-monster',
      }),
    ).toBe(
      'glm — recipe · glm-5 · host little-monster · lane own worktree · WIP 2 · no role card',
    )
  })

  it('counts a card against its limit', () => {
    expect(formatRoleCardCount(612)).toBe('612 / 4,000')
    expect(formatRoleCardCount(4212)).toBe('4,212 / 4,000')
  })

  it('says how wires address a seat, live', () => {
    expect(batonNameHelper('opus', false)).toBe(
      'Wires address this seat as “opus”.',
    )
    expect(batonNameHelper('  ', false)).toBe(
      'Wires cannot address this seat until it has a name.',
    )
    expect(batonNameHelper('opus-lm', true)).toMatch(
      /A recipe has no conversation/,
    )
  })

  it('names what a refusal did not change', () => {
    expect(refusalKeptLine('batonName', resident)).toMatch(
      /^Still named “opus”/,
    )
    expect(refusalKeptLine('wipLimit', resident)).toMatch(/WIP stays 1/)
    expect(
      refusalKeptLine('roleCard', { ...resident, roleCard: 'You are opus.' }),
    ).toMatch(/^Previous card kept/)
  })
})
