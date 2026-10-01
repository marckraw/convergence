import { describe, expect, it, vi } from 'vitest'
import { isCodexTierOffered } from './codex-service-tiers.pure'
import {
  CODEX_SERVICE_TIERS_CACHE_TTL_MS,
  CodexServiceTiersService,
} from './codex-service-tiers.service'

const FAST = {
  id: 'priority',
  name: 'Fast',
  description: '2x speed, increased usage',
}
const ULTRAFAST = {
  id: 'ultrafast',
  name: 'Ultrafast',
  description: 'Up to 8x speed, highest usage',
}

/** The relevant fields of the real 0.159.2 `model/list` records (MAR-3574). */
function record(model: string, serviceTiers: unknown[], extra = {}) {
  return {
    id: model,
    model,
    displayName: model,
    hidden: false,
    serviceTiers,
    defaultServiceTier: null,
    additionalSpeedTiers: ['fast'],
    isDefault: false,
    ...extra,
  }
}

/** A Pro account today: Fast on every GPT-6 model. */
const PRO = {
  data: [
    record('gpt-6.1-sol', [FAST], { isDefault: true }),
    record('gpt-6-astra', [FAST]),
  ],
}
/** A Pro $500 account: Astra adds Ultrafast. */
const PRO_500 = {
  data: [
    record('gpt-6.1-sol', [FAST]),
    record('gpt-6-astra', [FAST, ULTRAFAST]),
  ],
}

describe('CodexServiceTiersService (MAR-3574 R1)', () => {
  function service(answers: Record<string, unknown>) {
    let now = Date.parse('2026-10-01T08:00:00.000Z')
    const readModelList = vi.fn(
      async (account: { configDir: string } | null) =>
        answers[account?.configDir ?? 'ambient'],
    )
    const tiers = new CodexServiceTiersService({
      readModelList,
      resolveAccount: (id) => (id ? { configDir: `/accounts/${id}` } : null),
      isWarmingUp: () => false,
      now: () => now,
    })
    return {
      tiers,
      readModelList,
      advance: (ms: number) => {
        now += ms
      },
    }
  }

  it("answers each account from that account's own list", async () => {
    const { tiers } = service({
      '/accounts/icloud': PRO_500,
      '/accounts/proton': PRO,
    })
    const icloud = await tiers.getTiers({
      scope: { executionHostId: 'local', providerAccountId: 'icloud' },
    })
    const proton = await tiers.getTiers({
      scope: { executionHostId: 'local', providerAccountId: 'proton' },
    })
    expect(isCodexTierOffered(icloud, 'gpt-6-astra', 'ultrafast')).toBe(true)
    expect(isCodexTierOffered(proton, 'gpt-6-astra', 'ultrafast')).toBe(false)
  })

  it('reuses an answer for its window, and shares a read in flight', async () => {
    const { tiers, readModelList, advance } = service({
      '/accounts/icloud': PRO,
    })
    const scope = { executionHostId: 'local', providerAccountId: 'icloud' }
    await Promise.all([tiers.getTiers({ scope }), tiers.getTiers({ scope })])
    expect(readModelList).toHaveBeenCalledTimes(1)
    await tiers.getTiers({ scope })
    expect(readModelList).toHaveBeenCalledTimes(1)
    advance(CODEX_SERVICE_TIERS_CACHE_TTL_MS)
    await tiers.getTiers({ scope })
    expect(readModelList).toHaveBeenCalledTimes(2)
    await tiers.getTiers({ scope, forceRefresh: true })
    expect(readModelList).toHaveBeenCalledTimes(3)
  })

  it('a failed read claims no tiers, and is not remembered', async () => {
    const readModelList = vi
      .fn()
      .mockRejectedValueOnce(new Error('Codex app-server exited'))
      .mockResolvedValueOnce(PRO)
    const tiers = new CodexServiceTiersService({
      readModelList,
      isWarmingUp: () => false,
    })
    const failed = await tiers.getTiers()
    expect(failed).toMatchObject({
      status: 'unavailable',
      reason: 'Codex app-server exited',
    })
    expect(isCodexTierOffered(failed, 'gpt-6-astra', 'priority')).toBe(false)
    expect((await tiers.getTiers()).status).toBe('available')
  })

  it('says it is warming up instead of waiting on a cold server', async () => {
    const readModelList = vi.fn()
    const tiers = new CodexServiceTiersService({
      readModelList,
      isWarmingUp: () => true,
    })
    expect((await tiers.getTiers()).status).toBe('warming-up')
    expect(readModelList).not.toHaveBeenCalled()
  })
})
