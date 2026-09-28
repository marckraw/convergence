import type { SeatFigmaReach } from '../../../src/shared/types/tracker.types'
import type { ProviderAccountChatGptApps } from '../provider-account/provider-account-chatgpt-apps.pure'
import type { ProviderAccountChatGptSignIns } from '../provider-account/provider-account-chatgpt-sign-in.pure'
import type { ProviderAccountConnectorsResult } from '../provider-account/provider-account-mcp.types'
import {
  claudeFigmaReach,
  codexFigmaReach,
  figmaAppIds,
} from './seat-figma-reach.pure'

/** How long one account's Figma answer is trusted before it is asked again. */
export const SEAT_FIGMA_REACH_TTL_MS = 5 * 60_000

/**
 * The longest one check may run before it answers `unknown` (MAR-3526): a
 * hung `claude mcp list` would otherwise leave the account `checking`
 * forever. The command itself is not killed here; it answers into nothing.
 */
export const SEAT_FIGMA_REACH_CHECK_TIMEOUT_MS = 90_000

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
    only: { appIds?: readonly string[]; servers?: RegExp },
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
 *
 * It never makes the planner wait: a check can take tens of seconds on a cold
 * host, and the tracker tick awaits the plan. An answer is returned at once —
 * the remembered one (kept while a re-check runs), or `checking` for an
 * account never answered yet — and the check lands for the next tick.
 */
export class SeatFigmaReachService {
  private readonly answers = new Map<
    string,
    {
      settled: SeatFigmaReach | null
      checkedAt: number
      pending: Promise<void> | null
    }
  >()

  constructor(private readonly deps: SeatFigmaReachDeps) {}

  async forSeat(sessionId: string): Promise<SeatFigmaAnswer> {
    // One seat that can't be resolved never takes the crew's plan with it.
    let seat: SeatAccount | null
    try {
      seat = this.deps.seatAccount(sessionId)
    } catch {
      return { reach: 'unknown', account: null }
    }
    if (!seat || seat.accountId === null)
      return { reach: 'unknown', account: seat?.label ?? null }
    const key = `${seat.providerId}:${seat.accountId}`
    let held = this.answers.get(key)
    if (!held) {
      held = { settled: null, checkedAt: 0, pending: null }
      this.answers.set(key, held)
    }
    const fresh =
      held.settled !== null &&
      this.deps.now() - held.checkedAt < SEAT_FIGMA_REACH_TTL_MS
    if (!fresh && !held.pending) {
      const entry = held
      entry.pending = this.bounded(
        this.check(seat.providerId, seat.accountId),
      ).then((reach) => {
        entry.settled = reach
        entry.checkedAt = this.deps.now()
        entry.pending = null
      })
    }
    return { reach: held.settled ?? 'checking', account: seat.label }
  }

  /** Resolves once every check started so far has landed (for tests). */
  async settled(): Promise<void> {
    await Promise.all([...this.answers.values()].map((entry) => entry.pending))
  }

  private bounded(check: Promise<SeatFigmaReach>): Promise<SeatFigmaReach> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<SeatFigmaReach>((resolve) => {
      timer = setTimeout(
        () => resolve('unknown'),
        SEAT_FIGMA_REACH_CHECK_TIMEOUT_MS,
      )
    })
    return Promise.race([check, timeout]).finally(() => clearTimeout(timer))
  }

  private async check(
    providerId: string,
    accountId: string,
  ): Promise<SeatFigmaReach> {
    try {
      if (providerId === 'codex') {
        // Names first, then who-am-I for Figma alone: never every app.
        const apps = await this.deps.listChatGptApps(accountId)
        const signIns = await this.deps.checkChatGptAppSignIns(accountId, {
          appIds: figmaAppIds(apps),
          servers: /\bfigma\b/i,
        })
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
