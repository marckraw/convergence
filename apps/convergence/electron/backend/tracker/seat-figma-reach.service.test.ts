import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SEAT_FIGMA_REACH_CHECK_TIMEOUT_MS,
  SEAT_FIGMA_REACH_TTL_MS,
  SeatFigmaReachService,
  type SeatAccount,
} from './seat-figma-reach.service'

function bench(seat: SeatAccount | null) {
  let now = 1_000
  const deps = {
    seatAccount: vi.fn(() => seat),
    listChatGptApps: vi.fn(async () => ({
      providerAccountId: 'a',
      apps: [{ id: 'figma', name: 'Figma', state: 'available' as const }],
      requiresChatGpt: false,
      error: null,
    })),
    checkChatGptAppSignIns: vi.fn(
      async (_accountId: string, _only: unknown) => ({
        providerAccountId: 'a',
        checkedAt: null,
        error: null,
        signIns: [
          {
            appId: 'figma',
            status: 'signed-in' as 'signed-in' | 'needs-sign-in',
            account: 'm' as string | null,
            reason: null,
          },
        ],
        servers: [],
      }),
    ),
    listConnectors: vi.fn(async () => ({
      providerAccountId: 'c',
      connectors: [
        {
          name: 'claude.ai Figma',
          status: 'ready' as const,
          statusLabel: '✔ Connected',
          description: '',
          needsAuthorization: false,
        },
      ],
      error: null,
    })),
    now: () => now,
  }
  return {
    deps,
    service: new SeatFigmaReachService(deps),
    later: (ms: number) => {
      now += ms
    },
  }
}

describe('MAR-3526 a seat’s Figma reach is checked live, remembered per account, and never waited for', () => {
  it('answers at once with checking, and the check lands for the next ask', async () => {
    const codex = bench({
      providerId: 'codex',
      accountId: 'acct-ef',
      label: 'marcin@ef.design',
    })
    expect(await codex.service.forSeat('astra')).toEqual({
      reach: 'checking',
      account: 'marcin@ef.design',
    })
    await codex.service.settled()
    expect(await codex.service.forSeat('astra')).toEqual({
      reach: 'reaches',
      account: 'marcin@ef.design',
    })
    // Figma alone: never who-am-I on every app.
    expect(codex.deps.checkChatGptAppSignIns).toHaveBeenCalledExactlyOnceWith(
      'acct-ef',
      { appIds: ['figma'], servers: /\bfigma\b/i },
    )
    expect(codex.deps.listConnectors).not.toHaveBeenCalled()
  })

  it('a Claude seat asks its own list', async () => {
    const claude = bench({
      providerId: 'claude-code',
      accountId: 'acct-proton',
      label: 'marckraw@proton.me',
    })
    await claude.service.forSeat('opus')
    await claude.service.settled()
    expect(await claude.service.forSeat('opus')).toEqual({
      reach: 'reaches',
      account: 'marckraw@proton.me',
    })
    expect(claude.deps.listConnectors).toHaveBeenCalledExactlyOnceWith(
      'acct-proton',
    )
  })

  it('checks an account once while it runs, whichever seat asks', async () => {
    const { deps, service } = bench({
      providerId: 'codex',
      accountId: 'acct-ef',
      label: null,
    })
    await service.forSeat('astra')
    await service.forSeat('another-seat-same-account')
    await service.settled()
    expect(deps.checkChatGptAppSignIns).toHaveBeenCalledTimes(1)
  })

  it('re-checks after five minutes, answering with what it knew meanwhile', async () => {
    const { deps, service, later } = bench({
      providerId: 'codex',
      accountId: 'acct-ef',
      label: null,
    })
    await service.forSeat('astra')
    await service.settled()
    later(SEAT_FIGMA_REACH_TTL_MS - 1)
    expect((await service.forSeat('astra')).reach).toBe('reaches')
    expect(deps.checkChatGptAppSignIns).toHaveBeenCalledTimes(1)
    deps.checkChatGptAppSignIns.mockResolvedValue({
      providerAccountId: 'a',
      checkedAt: null,
      error: null,
      signIns: [
        {
          appId: 'figma',
          status: 'needs-sign-in' as const,
          account: null,
          reason: null,
        },
      ],
      servers: [],
    })
    later(1)
    expect((await service.forSeat('astra')).reach).toBe('reaches')
    await service.settled()
    expect(deps.checkChatGptAppSignIns).toHaveBeenCalledTimes(2)
    expect((await service.forSeat('astra')).reach).toBe('cannot-reach')
  })

  it('what it cannot tell is unknown: no seat, the ambient default, another provider, a check that threw', async () => {
    expect(await bench(null).service.forSeat('gone')).toEqual({
      reach: 'unknown',
      account: null,
    })
    const ambient = bench({
      providerId: 'claude-code',
      accountId: null,
      label: null,
    })
    expect((await ambient.service.forSeat('s')).reach).toBe('unknown')
    expect(ambient.deps.listConnectors).not.toHaveBeenCalled()
    for (const seat of [
      { providerId: 'cursor', accountId: 'x', label: null },
      { providerId: 'codex', accountId: 'acct', label: null },
    ]) {
      const b = bench(seat)
      b.deps.checkChatGptAppSignIns.mockRejectedValue(new Error('ipc gone'))
      await b.service.forSeat('s')
      await b.service.settled()
      expect((await b.service.forSeat('s')).reach).toBe('unknown')
    }
  })
})

describe('MAR-3526 a check that hangs or a seat that throws never holds the plan', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('a check still running after its limit answers unknown', async () => {
    vi.useFakeTimers()
    const b = bench({
      providerId: 'claude-code',
      accountId: 'acct',
      label: null,
    })
    b.deps.listConnectors.mockReturnValue(new Promise(() => {}))
    expect((await b.service.forSeat('s')).reach).toBe('checking')
    await vi.advanceTimersByTimeAsync(SEAT_FIGMA_REACH_CHECK_TIMEOUT_MS)
    expect((await b.service.forSeat('s')).reach).toBe('unknown')
  })
  it('a seat whose account cannot be resolved is unknown, not a thrown plan', async () => {
    const b = bench(null)
    b.deps.seatAccount.mockImplementation(() => {
      throw new Error('database closed')
    })
    expect(await b.service.forSeat('s')).toEqual({
      reach: 'unknown',
      account: null,
    })
  })
})
