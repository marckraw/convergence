import { describe, expect, it, vi } from 'vitest'
import {
  ClaudeQuotaService,
  ensureCcusageBinaryExecutable,
} from './claude-quota.service'
import { ClaudeRateLimitState } from './claude-rate-limit.state'

describe('ensureCcusageBinaryExecutable', () => {
  it('marks the resolved native ccusage binary executable when it lacks execute bits', () => {
    const chmod = vi.fn()

    ensureCcusageBinaryExecutable('/app/node_modules/@ccusage/bin/ccusage', {
      chmod,
      platform: 'darwin',
      stat: () => ({ mode: 0o100644 }),
    })

    expect(chmod).toHaveBeenCalledWith(
      '/app/node_modules/@ccusage/bin/ccusage',
      0o755,
    )
  })

  it('keeps existing executable native binaries unchanged', () => {
    const chmod = vi.fn()

    ensureCcusageBinaryExecutable('/app/node_modules/@ccusage/bin/ccusage', {
      chmod,
      platform: 'darwin',
      stat: () => ({ mode: 0o100755 }),
    })

    expect(chmod).not.toHaveBeenCalled()
  })

  it('does not chmod the PATH fallback command', () => {
    const chmod = vi.fn()
    const stat = vi.fn()

    ensureCcusageBinaryExecutable('ccusage', {
      chmod,
      platform: 'darwin',
      stat,
    })

    expect(stat).not.toHaveBeenCalled()
    expect(chmod).not.toHaveBeenCalled()
  })

  it('does not chmod Windows binaries', () => {
    const chmod = vi.fn()
    const stat = vi.fn()

    ensureCcusageBinaryExecutable('C:\\app\\ccusage.exe', {
      chmod,
      platform: 'win32',
      stat,
    })

    expect(stat).not.toHaveBeenCalled()
    expect(chmod).not.toHaveBeenCalled()
  })

  it('reports chmod failures with ccusage context', () => {
    expect(() =>
      ensureCcusageBinaryExecutable('/app/node_modules/@ccusage/bin/ccusage', {
        chmod: () => {
          throw new Error('EACCES')
        },
        platform: 'darwin',
        stat: () => ({ mode: 0o100644 }),
      }),
    ).toThrow('ccusage native binary is not executable: EACCES')
  })
})

describe('ClaudeQuotaService rate-limit scoping', () => {
  const WEEKLY = { weekly: [] }
  const BLOCKS = { blocks: [] }

  function service(rateLimits?: ClaudeRateLimitState) {
    const ccusage = vi.fn(async (args: string[]) =>
      args[0] === 'claude' ? WEEKLY : BLOCKS,
    )
    return new ClaudeQuotaService(ccusage, rateLimits ?? null)
  }

  it('reports the selected account limit reading, not a machine-wide one', async () => {
    // The account-authoritative half of the snapshot. ccusage reads the shared
    // transcript store and cannot be split per account; this can.
    const rateLimits = new ClaudeRateLimitState()
    rateLimits.record(
      { executionHostId: 'local', providerAccountId: 'acct-a' },
      {
        status: 'rejected',
        rateLimitType: 'seven_day',
        resetsAt: '2099-08-09T00:00:00.000Z',
      },
    )

    const snapshot = await service(rateLimits).getQuota({
      scope: { executionHostId: 'local', providerAccountId: 'acct-a' },
    })

    expect(snapshot.rateLimit).toMatchObject({
      providerAccountId: 'acct-a',
      status: 'rejected',
    })
  })

  it('reports nothing for an account that has not run a turn yet', async () => {
    const rateLimits = new ClaudeRateLimitState()
    rateLimits.record(
      { executionHostId: 'local', providerAccountId: 'acct-a' },
      { status: 'rejected', rateLimitType: null, resetsAt: null },
    )

    const snapshot = await service(rateLimits).getQuota({
      scope: { executionHostId: 'local', providerAccountId: 'acct-b' },
    })

    expect(snapshot.rateLimit).toBeUndefined()
  })

  it('carries the limit reading even when ccusage cannot answer', async () => {
    // Precisely the moment it matters most: the local usage log failing says
    // nothing about whether the provider told us we are at a limit.
    const rateLimits = new ClaudeRateLimitState()
    rateLimits.record(
      { executionHostId: 'local', providerAccountId: null },
      { status: 'rejected', rateLimitType: 'five_hour', resetsAt: null },
    )
    const failing = new ClaudeQuotaService(async () => {
      throw new Error('ccusage exploded')
    }, rateLimits)

    const snapshot = await failing.getQuota({
      scope: { executionHostId: 'local', providerAccountId: null },
    })

    expect(snapshot.status).toBe('unavailable')
    expect(snapshot.rateLimit?.status).toBe('rejected')
  })

  it('asks for no account and gets no account-authoritative reading', async () => {
    const rateLimits = new ClaudeRateLimitState()
    rateLimits.record(
      { executionHostId: 'local', providerAccountId: null },
      { status: 'rejected', rateLimitType: null, resetsAt: null },
    )

    expect((await service(rateLimits).getQuota()).rateLimit).toBeUndefined()
  })
})
