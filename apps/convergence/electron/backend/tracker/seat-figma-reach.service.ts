import type { SeatFigmaReach } from '../../../src/shared/types/tracker.types'
import type { ProviderAccountChatGptApps } from '../provider-account/provider-account-chatgpt-apps.pure'
import type { ProviderAccountChatGptSignIns } from '../provider-account/provider-account-chatgpt-sign-in.pure'
import type { ProviderAccountConnectorsResult } from '../provider-account/provider-account-mcp.types'
import { claudeFigmaReach, codexFigmaReach } from './seat-figma-reach.pure'

/** How long one account's Figma answer is trusted before it is asked again. */
export const SEAT_FIGMA_REACH_TTL_MS = 5 * 60_000

export interface SeatFigmaAnswer {
  reach: SeatFigmaReach
  /** The account's name for the Loom's sentence, when there is one. */
  account: string | null
}

/** The seat's account for its next automatic turn, as dispatch resolves it. */
export interface SeatAccount {
  providerId: string
  /** null: the ambient default, which this check does not claim to know. */
  accountId: string | null
  label: string | null
}

export interface SeatFigmaReachDeps {
  seatAccount(sessionId: string): SeatAccount | null
  listChatGptApps(accountId: string): Promise<ProviderAccountChatGptApps>
  checkChatGptAppSignIns(
    accountId: string,
  ): Promise<ProviderAccountChatGptSignIns>
  listConnectors(accountId: string): Promise<ProviderAccountConnectorsResult>
  now(): number
}

/**
 * Whether a seat's account reaches Figma, checked live and remembered per
 * account for {@link SEAT_FIGMA_REACH_TTL_MS} (MAR-3526), so a tracker tick
 * every minute doesn't call Figma every minute. Asked only for a seat with a
 * design-sourced issue. Anything it cannot tell — an ambient or remote seat,
 * a provider without these checks, a check that threw — is `unknown`, which
 * the planner stops on like `cannot-reach`.
 */
export class SeatFigmaReachService {
  private readonly answers = new Map<
    string,
    { at: number; answer: Promise<SeatFigmaReach> }
  >()

  constructor(private readonly deps: SeatFigmaReachDeps) {}

  async forSeat(sessionId: string): Promise<SeatFigmaAnswer> {
    const seat = this.deps.seatAccount(sessionId)
    if (!seat || seat.accountId === null)
      return { reach: 'unknown', account: seat?.label ?? null }
    const key = `${seat.providerId}:${seat.accountId}`
    const now = this.deps.now()
    const held = this.answers.get(key)
    if (!held || now - held.at >= SEAT_FIGMA_REACH_TTL_MS) {
      this.answers.set(key, {
        at: now,
        answer: this.check(seat.providerId, seat.accountId),
      })
    }
    return {
      reach: await this.answers.get(key)!.answer,
      account: seat.label,
    }
  }

  private async check(
    providerId: string,
    accountId: string,
  ): Promise<SeatFigmaReach> {
    try {
      if (providerId === 'codex') {
        const [apps, signIns] = await Promise.all([
          this.deps.listChatGptApps(accountId),
          this.deps.checkChatGptAppSignIns(accountId),
        ])
        return codexFigmaReach({ apps, signIns })
      }
      if (providerId === 'claude-code')
        return claudeFigmaReach(await this.deps.listConnectors(accountId))
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }
}
