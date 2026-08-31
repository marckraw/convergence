import type {
  AttentionState,
  ProviderEffortOption,
  ProviderInfo,
  ProviderModelOption,
  ReasoningEffort,
  SessionStatus,
} from './session.types'

export interface ResolvedProviderSelection {
  provider: ProviderInfo | null
  providerId: string
  providerLabel: string
  model: ProviderModelOption | null
  modelId: string
  effort: ProviderEffortOption | null
  effortId: ReasoningEffort | ''
}

export interface ProviderLifecycleBadge {
  label: string
  title: string
}

export interface StoredProviderDefaults {
  providerId?: string | null
  modelId?: string | null
  effortId?: ReasoningEffort | null
}

export function getProviderDisplayLabel(provider: ProviderInfo): string {
  return provider.vendorLabel || provider.name
}

export function getProviderLifecycleBadge(
  provider: ProviderInfo,
): ProviderLifecycleBadge | null {
  if (provider.id !== 'antigravity') return null

  return {
    label: 'ALPHA',
    title:
      'Antigravity support is early: tool visibility is post-run and provider telemetry is limited.',
  }
}

export function resolveProviderSelection(
  providers: ProviderInfo[],
  providerId: string | null,
  modelId: string | null,
  effortId: ReasoningEffort | null,
  storedDefaults: StoredProviderDefaults = {},
): ResolvedProviderSelection {
  const provider =
    providers.find((item) => item.id === providerId) ??
    providers.find((item) => item.id === storedDefaults.providerId) ??
    providers[0] ??
    null
  const resolvedProviderId = provider?.id ?? ''
  const providerLabel = provider ? getProviderDisplayLabel(provider) : ''

  const storedModelMatchesProvider =
    provider && provider.id === storedDefaults.providerId

  const model =
    provider?.modelOptions.find((item) => item.id === modelId) ??
    (storedModelMatchesProvider
      ? provider?.modelOptions.find(
          (item) => item.id === storedDefaults.modelId,
        )
      : undefined) ??
    provider?.modelOptions.find(
      (item) => item.id === provider?.defaultModelId,
    ) ??
    provider?.modelOptions[0] ??
    null
  const resolvedModelId = model?.id ?? ''

  const storedEffortMatchesModel =
    storedModelMatchesProvider && model?.id === storedDefaults.modelId

  const effort =
    model?.effortOptions.find((item) => item.id === effortId) ??
    (storedEffortMatchesModel
      ? model?.effortOptions.find((item) => item.id === storedDefaults.effortId)
      : undefined) ??
    model?.effortOptions.find((item) => item.id === model.defaultEffort) ??
    model?.effortOptions.find((item) => item.id === 'medium') ??
    model?.effortOptions[0] ??
    null

  return {
    provider,
    providerId: resolvedProviderId,
    providerLabel,
    model,
    modelId: resolvedModelId,
    effort,
    effortId: effort?.id ?? '',
  }
}

/**
 * Which of its three lives the composer's selection row is living (MAR-2550).
 *
 * - `draft` — nothing to continue. Every control is free, cross-provider
 *   included, because no row has been committed to yet.
 * - `session` — a live session on a provider we still have. Its provider is
 *   fixed for life; its model and effort are fixed only while a turn is in
 *   flight, because every adapter takes both at turn time.
 * - `stranded` — a live session whose provider has left the catalog. The row
 *   exists and nothing here can act on it, so nothing here may pretend to.
 *
 * Naming the third state is the whole point. It existed before this type did,
 * and because it had no name two predicates disagreed about it: the provider
 * lock asked "can this session continue?" and went false, while every write
 * still asked "is there a session?" and went true — an unlocked provider
 * select above a composer that was still writing to the hidden row.
 */
export type ComposerSelectionMode = 'draft' | 'session' | 'stranded'

export interface ComposerSelectionLocks {
  mode: ComposerSelectionMode
  /** The provider select, and everything else a session fixes for life. */
  providerLocked: boolean
  /** The model dialog and the effort select beside it. */
  modelLocked: boolean
  /** Whether the next send continues the session instead of starting one. */
  canContinue: boolean
}

/**
 * The one derived mode every control in the composer reads (MAR-2550).
 *
 * The renderer can only see status and attention; the backend also refuses
 * while a provider process is still attached, which is invisible from here.
 * That is the right split: these locks are the affordance, the backend's
 * refusal is the authority, and a change it rejects surfaces as an error
 * rather than being quietly dropped.
 *
 * A session whose provider is present but cannot continue — the shell provider
 * is the live example — is a `draft`, not a `session`: the next send starts a
 * new session, so the row it came from must not be what the pickers write to.
 */
export function resolveComposerSelectionLocks(
  providers: ProviderInfo[],
  session: {
    providerId: string
    status: SessionStatus
    attention: AttentionState
  } | null,
): ComposerSelectionLocks {
  const draft: ComposerSelectionLocks = {
    mode: 'draft',
    providerLocked: false,
    modelLocked: false,
    canContinue: false,
  }
  if (!session) return draft

  const provider = providers.find((item) => item.id === session.providerId)
  if (!provider) {
    return {
      mode: 'stranded',
      providerLocked: true,
      modelLocked: true,
      canContinue: false,
    }
  }
  if (!provider.supportsContinuation) return draft

  const busy =
    session.status === 'running' ||
    session.attention === 'needs-input' ||
    session.attention === 'needs-approval'
  return {
    mode: 'session',
    providerLocked: true,
    modelLocked: busy,
    canContinue: true,
  }
}

/**
 * What the selection row shows for a stranded session (MAR-2550).
 *
 * `resolveProviderSelection` falls back to the first provider it can find,
 * which is right for a draft and a lie for a session: the composer read
 * "OpenAI" while every write still landed on a Claude row. A control has to
 * describe the action it is attached to, so this shows the row's own provider,
 * model and effort, and says plainly that the provider is not here.
 *
 * `provider` and `model` stay null on purpose — that is what the rest of the
 * composer already keys off to disable itself, and there is genuinely no
 * catalog entry to hand it.
 */
export function describeUnavailableProviderSelection(session: {
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
}): ResolvedProviderSelection {
  const effort: ProviderEffortOption | null = session.effort
    ? { id: session.effort, label: session.effort }
    : null
  return {
    provider: null,
    providerId: session.providerId,
    providerLabel: `${session.providerId} (unavailable)`,
    model: null,
    modelId: session.model ?? '',
    effort,
    effortId: session.effort ?? '',
  }
}

/**
 * The model catalog an existing session is allowed to be moved around inside
 * (MAR-2550).
 *
 * The model dialog carries a provider dimension — picking a row from another
 * provider's list calls back with that provider's id — so an unscoped catalog
 * made it a second provider switch, quieter than the select beside it and not
 * covered by that select's lock. A control should not offer what it is not
 * allowed to do, so an existing session sees its own provider and nothing else.
 *
 * A draft passes `null` and keeps the whole catalog: choosing across providers
 * is exactly right before a session exists. A provider that has left the
 * catalog scopes to nothing, which reads as an empty picker rather than a door.
 */
export function scopeModelCatalogToProvider(
  providers: ProviderInfo[],
  lockedProviderId: string | null | undefined,
): ProviderInfo[] {
  if (!lockedProviderId) return providers
  return providers.filter((provider) => provider.id === lockedProviderId)
}

/**
 * What to persist on an existing session's row for a model pick, or `null`
 * when the pick belongs to another provider and must be refused (MAR-2550).
 *
 * The refusal is defence in depth: `scopeModelCatalogToProvider` already keeps
 * the foreign provider out of the dialog, and the backend refuses a selection
 * whose provider disagrees with the row. This is the middle layer, and it is
 * the one that stops a foreign model id from ever leaving the composer — the
 * bug it exists for wrote a Codex model id onto a Claude session's row while
 * silently discarding the Codex provider that came with it.
 *
 * `providerId` travels with the write rather than being assumed by the caller:
 * it is what this side believes, and the backend's identity check is only
 * worth having if it is told the truth.
 */
export function resolveSessionModelSelectionWrite(
  providers: ProviderInfo[],
  session: { providerId: string },
  requestedProviderId: string | null,
  requestedModelId: string,
): {
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
} | null {
  const selection = resolveProviderSelection(
    providers,
    requestedProviderId ?? session.providerId,
    requestedModelId,
    null,
  )
  if (selection.providerId !== session.providerId) return null
  return {
    providerId: selection.providerId,
    model: selection.modelId || null,
    effort: selection.effortId || null,
  }
}
