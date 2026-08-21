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
 * Whether the model and effort pickers should be locked right now (MAR-2550).
 *
 * Deliberately narrower than the provider lock beside it. A session keeps its
 * provider for life — continuation tokens are provider-specific — but every
 * adapter takes the model and effort at turn time, so an idle conversation can
 * be moved onto a different model and its next turn will genuinely run there.
 *
 * The renderer can only see status and attention; the backend also refuses
 * while a provider process is still attached, which is invisible from here.
 * That is the right split: this lock is the affordance, the backend's refusal
 * is the authority, and a change it rejects surfaces as an error rather than
 * being quietly dropped.
 */
export function isModelSelectionLocked(
  session: { status: SessionStatus; attention: AttentionState } | null,
): boolean {
  if (!session) return false
  if (session.status === 'running') return true
  return (
    session.attention === 'needs-input' ||
    session.attention === 'needs-approval'
  )
}
