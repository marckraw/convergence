import { describe, expect, it, vi } from 'vitest'
import {
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
    checkChatGptAppSignIns: vi.fn(async () => ({
      providerAccountId: 'a',
      checkedAt: null,
      error: null,
      signIns: [
        {
          appId: 'figma',
          status: 'signed-in' as const,
          account: 'm',
          reason: null,
        },
      ],
      servers: [],
    })),
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

describe('MAR-3526 a seat’s Figma reach is checked live, and remembered per account', () => {
  it('an OpenAI seat asks its account’s apps and sign-ins; a Claude seat asks its list', async () => {
    const codex = bench({
      providerId: 'codex',
      accountId: 'acct-ef',
      label: 'marcin@ef.design',
    })
    expect(await codex.service.forSeat('astra')).toEqual({
      reach: 'reaches',
      account: 'marcin@ef.design',
    })
    expect(codex.deps.checkChatGptAppSignIns).toHaveBeenCalledWith('acct-ef')
    expect(codex.deps.listConnectors).not.toHaveBeenCalled()
    const claude = bench({
      providerId: 'claude-code',
      accountId: 'acct-proton',
      label: 'marckraw@proton.me',
    })
    expect(await claude.service.forSeat('opus')).toEqual({
      reach: 'reaches',
      account: 'marckraw@proton.me',
    })
    expect(claude.deps.listConnectors).toHaveBeenCalledWith('acct-proton')
  })

  it('asks again only after five minutes, whichever seat asks', async () => {
    const { deps, service, later } = bench({
      providerId: 'codex',
      accountId: 'acct-ef',
      label: null,
    })
    await service.forSeat('astra')
    await service.forSeat('another-seat-same-account')
    later(SEAT_FIGMA_REACH_TTL_MS - 1)
    await service.forSeat('astra')
    expect(deps.checkChatGptAppSignIns).toHaveBeenCalledTimes(1)
    later(1)
    await service.forSeat('astra')
    expect(deps.checkChatGptAppSignIns).toHaveBeenCalledTimes(2)
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
    expect(
      (
        await bench({
          providerId: 'cursor',
          accountId: 'x',
          label: null,
        }).service.forSeat('grok')
      ).reach,
    ).toBe('unknown')
    const broken = bench({
      providerId: 'codex',
      accountId: 'acct',
      label: null,
    })
    broken.deps.checkChatGptAppSignIns.mockRejectedValue(new Error('ipc gone'))
    expect((await broken.service.forSeat('astra')).reach).toBe('unknown')
  })
})
