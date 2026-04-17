import type {
  ProviderEffortOption,
  ProviderInfo,
  ProviderModelOption,
  ReasoningEffort,
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

export interface StoredProviderDefaults {
  providerId?: string | null
  modelId?: string | null
  effortId?: ReasoningEffort | null
}

export function getProviderDisplayLabel(provider: ProviderInfo): string {
  return provider.vendorLabel || provider.name
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
