import { describe, expect, it } from 'vitest'
import type { ProviderHostUsage } from '@/entities/session'
import { resolveHostUsagePill } from './host-usage-pill.pure'

const NOW = Date.parse('2026-10-18T11:00:00.000Z')

const USAGE: ProviderHostUsage = {
  observedAt: '2026-10-18T10:00:00.000Z',
  source: 'turn',
  status: 'ok',
  windows: [
    {
      id: 'five_hour',
      span: 'session',
      label: 'Session',
      usedPercent: 30,
      resetsAt: '2026-10-18T12:00:00.000Z',
      modelFamily: null,
    },
    {
      id: 'seven_day',
      span: 'week',
      label: 'Week',
      usedPercent: 70,
      resetsAt: null,
      modelFamily: null,
    },
    {
      id: 'seven_day_opus',
      span: 'week',
      label: 'Opus week',
      usedPercent: 95,
      resetsAt: null,
      modelFamily: 'opus',
    },
    {
      id: 'reset_already',
      span: 'other',
      label: 'Old',
      usedPercent: 100,
      resetsAt: '2026-10-18T10:30:00.000Z',
      modelFamily: null,
    },
  ],
  credits: {
    hasCredits: true,
    unlimited: false,
    balance: '12.50',
    observedAt: '2026-10-18T10:00:00.000Z',
  },
}

function pill(
  usage: ProviderHostUsage,
  model: { id: string; label: string } | null,
) {
  return resolveHostUsagePill({
    usage,
    providerName: 'Claude Code',
    hostLabel: 'kuba-vps',
    model,
    now: NOW,
  })
}

describe('resolveHostUsagePill (MAR-4272)', () => {
  it('reads the tightest window still limiting the selected model', () => {
    const view = pill(USAGE, { id: 'sonnet', label: 'Claude Sonnet' })
    // The Opus week does not limit Sonnet, and a window past its reset says
    // nothing: the protocol's own rule, shared with accent.'s pickers.
    expect(view.windows.map((window) => window.id)).toEqual([
      'five_hour',
      'seven_day',
    ])
    expect(view.remainingPercent).toBe(30)
    expect(view.text).toBe('Claude Code 30%')
    expect(view.tone).toBe('warning')
    expect(view.title).toBe('Claude Code on kuba-vps')
  })

  it("counts a family's window for that family's model", () => {
    const view = pill(USAGE, { id: 'claude-opus-5-5', label: 'Opus 5.5' })
    expect(view.windows.map((window) => window.id)).toContain('seven_day_opus')
    expect(view.remainingPercent).toBe(5)
    expect(view.tone).toBe('danger')
  })

  it("lets the provider's own verdict outrank the arithmetic", () => {
    const limited = pill(
      { ...USAGE, status: 'limited' },
      { id: 'sonnet', label: 'Sonnet' },
    )
    expect(limited.tone).toBe('danger')
    expect(limited.text).toBe('Claude Code limited')
    const warning = pill(
      {
        ...USAGE,
        status: 'warning',
        windows: [{ ...USAGE.windows[0]!, usedPercent: 5 }],
      },
      { id: 'sonnet', label: 'Sonnet' },
    )
    expect(warning.tone).toBe('warning')
  })

  it('says no window is in force rather than inventing a number', () => {
    const view = pill({ ...USAGE, windows: [] }, null)
    expect(view.remainingPercent).toBeNull()
    expect(view.text).toBe('Claude Code --')
    expect(view.tone).toBe('neutral')
  })

  it('shows the credits as reported, never converted', () => {
    expect(pill(USAGE, null).credits).toEqual({
      text: 'Available',
      balance: '12.50',
      observedAt: '2026-10-18T10:00:00.000Z',
    })
    expect(
      pill(
        {
          ...USAGE,
          credits: { ...USAGE.credits!, unlimited: true, balance: '3' },
        },
        null,
      ).credits,
    ).toMatchObject({ text: 'Unlimited', balance: null })
  })
})
