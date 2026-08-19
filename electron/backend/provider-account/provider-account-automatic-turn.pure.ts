import type { ProviderAccountStatus } from './provider-account.types'

/**
 * The little Convergence needs to know about an account to decide whether it
 * may serve a turn nobody is watching. Deliberately not the whole
 * `ProviderAccount`: this decision has no business reading credential paths.
 */
export interface AutomaticTurnAccount {
  id: string
  isDefault: boolean
  status: ProviderAccountStatus
}

/**
 * Where the resolver learns which accounts a provider has.
 *
 * Narrow on purpose: whatever holds this may learn that accounts exist and
 * whether they can take work, and nothing about the credentials behind them.
 */
export interface AutomaticTurnAccountSource {
  listByProvider(providerId: string): AutomaticTurnAccount[]
}

/**
 * Which account serves a turn Convergence started on its own.
 *
 * Relays and review spawns begin turns without anyone choosing an account, and
 * until now that meant the ambient `~/.claude` credential every time -- work
 * quietly billed to whichever account happens to be signed in on the machine,
 * which is exactly what enrolling accounts was meant to stop.
 *
 * The chain, in order:
 *
 * 1. **The account the session last rode.** A session that has been talking to
 *    one subscription keeps talking to it; a relay is a new turn in an existing
 *    conversation, not a new relationship.
 * 2. **The enrolled default for its provider.** What the composer would have
 *    preselected had a human opened it.
 * 3. **Ambient.** No enrolled accounts, or none usable -- today's behaviour,
 *    unchanged, and never an error.
 *
 * Modelled on `resolveInitialProviderAccountSelection` in the renderer, so an
 * automatic turn lands where the user would have seen the composer preselect.
 * It deliberately parts company in three places, each because nobody is looking
 * at this choice when it is made:
 *
 * - **A recorded account that is gone or unusable falls through to the enrolled
 *   default, not to ambient.** The composer returns ambient there and shows the
 *   user it did; an unattended hop would just quietly bill the shared
 *   credential, which is the bug this whole change exists to kill.
 * - **An inherited account must be connected.** The composer will re-select an
 *   unusable account and let the turn fail at the user's own hand. A relay has
 *   no hand to fail at.
 * - **A remote session resolves to ambient** (rule 4 below), which the composer
 *   expresses by disabling its picker instead.
 *
 * The middle two mean a wire can change which subscription it spends when an
 * account is deleted or stops being usable. That is traceable -- every turn
 * records the account it ran on -- and the alternatives are worse: a wire that
 * stops working, or one that quietly reverts to ambient.
 */
export function resolveAccountForAutomaticTurn(input: {
  /** Remote hosts cannot carry a local credential (PA10). */
  executionHost: string
  /** Newest recorded turn account for the session, or null for a new one. */
  lastTurnAccountId: string | null | undefined
  accounts: readonly AutomaticTurnAccount[]
}): string | null {
  // 4. A remote session must resolve to ambient: sending it a local account id
  // would trip `assertLocalAccountSelection` and fail the hop outright, so the
  // wire would break rather than degrade.
  if (input.executionHost === 'remote') return null

  const inherited = input.accounts.find(
    (account) =>
      account.id === input.lastTurnAccountId && isUsableForTurns(account),
  )
  if (inherited) return inherited.id

  // A recorded account that is gone or unusable falls through to the default
  // rather than to ambient: the alternative is silently spending the shared
  // credential because a row was deleted.
  const enrolledDefault = input.accounts.find(
    (account) => account.isDefault && isUsableForTurns(account),
  )
  return enrolledDefault?.id ?? null
}

/**
 * Only a connected account may take work. An expired or unavailable one is PA7 having caught
 * it serving somebody else, and handing it an unattended turn would spend the
 * wrong subscription with nobody watching.
 */
function isUsableForTurns(account: AutomaticTurnAccount): boolean {
  return account.status === 'connected'
}
