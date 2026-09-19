import { describe, expect, it } from 'vitest'
import { laterReadAt, loomRefreshView } from './loom-refresh.pure'

const NOW = Date.parse('2026-09-19T15:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('MAR-3227 R6: what the Refresh control says', () => {
  it.each([
    [null, null, 'never read', false],
    [ago(0), null, 'read 0 s ago', true],
    [ago(59_999), null, 'read 59 s ago', true],
    [ago(60_000), null, 'read 1 min ago', false],
    [ago(2 * 3600_000), null, 'read 2 h ago', false],
    [ago(3 * 86_400_000), null, 'read 3 d ago', false],
  ])('last read %s -> %s', (lastOkAt, refreshableAt, label, live) => {
    const view = loomRefreshView({ lastOkAt, refreshableAt, now: NOW })
    expect(view.label).toBe(label)
    expect(view.blocked).toBe(false)
    expect(view.live).toBe(live)
    // No age, no clock.
    expect(view.ticking).toBe(lastOkAt !== null)
  })

  it('inside the floor: just read, blocked, on the second clock', () => {
    expect(
      loomRefreshView({
        lastOkAt: ago(2_000),
        refreshableAt: new Date(NOW + 8_000).toISOString(),
        now: NOW,
      }),
    ).toEqual({ label: 'just read', blocked: true, ticking: true, live: true })
  })

  it('the floor ends at its instant, not a second later', () => {
    const view = loomRefreshView({
      lastOkAt: ago(10_000),
      refreshableAt: new Date(NOW).toISOString(),
      now: NOW,
    })
    expect(view).toMatchObject({ label: 'read 10 s ago', blocked: false })
  })

  it('the later read wins, and an unparseable one never does', () => {
    expect(laterReadAt(ago(5_000), ago(1_000))).toBe(ago(1_000))
    expect(laterReadAt(ago(1_000), ago(5_000))).toBe(ago(1_000))
    expect(laterReadAt(null, ago(1_000))).toBe(ago(1_000))
    expect(laterReadAt(ago(1_000), 'not a date')).toBe(ago(1_000))
    expect(laterReadAt(null, null)).toBeNull()
  })
})
