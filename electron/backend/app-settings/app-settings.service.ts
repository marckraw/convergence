import type { StateService } from '../state/state.service'
import type {
  ProviderDescriptor,
  ReasoningEffort,
} from '../provider/provider.types'
import type {
  AppSettings,
  AppSettingsInput,
  ResolvedSessionDefaults,
} from './app-settings.types'

export const APP_SETTINGS_KEY = 'app_settings'

type ProviderDescriptorLoader = () => Promise<ProviderDescriptor[]>

function parseNamingMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>).flatMap(
    ([providerId, modelId]) =>
      typeof modelId === 'string' && modelId.length > 0
        ? [[providerId, modelId] as const]
        : [],
  )
  return Object.fromEntries(entries)
}

function parse(raw: string | null): AppSettings {
  const empty: AppSettings = {
    defaultProviderId: null,
    defaultModelId: null,
    defaultEffortId: null,
    namingModelByProvider: {},
  }

  if (!raw) return empty

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      defaultProviderId:
        typeof parsed.defaultProviderId === 'string'
          ? parsed.defaultProviderId
          : null,
      defaultModelId:
        typeof parsed.defaultModelId === 'string'
          ? parsed.defaultModelId
          : null,
      defaultEffortId:
        typeof parsed.defaultEffortId === 'string'
          ? (parsed.defaultEffortId as ReasoningEffort)
          : null,
      namingModelByProvider: parseNamingMap(parsed.namingModelByProvider),
    }
  } catch {
    return empty
  }
}

function validateNamingMap(
  map: Record<string, string>,
  descriptors: ProviderDescriptor[],
): Record<string, string> {
  const byId = new Map(
    descriptors.map((descriptor) => [descriptor.id, descriptor]),
  )
  const validated: Record<string, string> = {}
  for (const [providerId, modelId] of Object.entries(map)) {
    const descriptor = byId.get(providerId)
    if (!descriptor) continue
    const hasModel = descriptor.modelOptions.some(
      (option) => option.id === modelId,
    )
    if (hasModel) validated[providerId] = modelId
  }
  return validated
}

function validateAgainst(
  settings: AppSettings,
  descriptors: ProviderDescriptor[],
): AppSettings {
  const namingModelByProvider = validateNamingMap(
    settings.namingModelByProvider,
    descriptors,
  )

  const provider = descriptors.find(
    (item) => item.id === settings.defaultProviderId,
  )
  if (!provider) {
    return {
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
      namingModelByProvider,
    }
  }

  const model = provider.modelOptions.find(
    (item) => item.id === settings.defaultModelId,
  )
  if (!model) {
    return {
      defaultProviderId: provider.id,
      defaultModelId: null,
      defaultEffortId: null,
      namingModelByProvider,
    }
  }

  const effort = model.effortOptions.find(
    (item) => item.id === settings.defaultEffortId,
  )
  return {
    defaultProviderId: provider.id,
    defaultModelId: model.id,
    defaultEffortId: effort ? effort.id : null,
    namingModelByProvider,
  }
}

export class AppSettingsService {
  constructor(
    private readonly stateService: StateService,
    private readonly loadDescriptors: ProviderDescriptorLoader,
  ) {}

  async getAppSettings(): Promise<AppSettings> {
    const raw = this.stateService.get(APP_SETTINGS_KEY)
    const parsed = parse(raw)
    const descriptors = await this.loadDescriptors()
    return validateAgainst(parsed, descriptors)
  }

  async setAppSettings(input: AppSettingsInput): Promise<AppSettings> {
    const descriptors = await this.loadDescriptors()
    const provider = descriptors.find(
      (item) => item.id === input.defaultProviderId,
    )
    if (input.defaultProviderId !== null && !provider) {
      throw new Error(`Unknown provider id: ${input.defaultProviderId}`)
    }

    let model = null as ProviderDescriptor['modelOptions'][number] | null
    if (provider && input.defaultModelId !== null) {
      model =
        provider.modelOptions.find(
          (item) => item.id === input.defaultModelId,
        ) ?? null
      if (!model) {
        throw new Error(
          `Unknown model id for provider ${provider.id}: ${input.defaultModelId}`,
        )
      }
    }

    if (model && input.defaultEffortId !== null) {
      const effort = model.effortOptions.find(
        (item) => item.id === input.defaultEffortId,
      )
      if (!effort) {
        throw new Error(
          `Unknown effort id for model ${model.id}: ${input.defaultEffortId}`,
        )
      }
    }

    const namingModelByProvider = validateNamingMap(
      input.namingModelByProvider ?? {},
      descriptors,
    )

    const toStore: AppSettings = {
      defaultProviderId: provider ? provider.id : null,
      defaultModelId: model ? model.id : null,
      defaultEffortId:
        model && input.defaultEffortId !== null ? input.defaultEffortId : null,
      namingModelByProvider,
    }

    this.stateService.set(APP_SETTINGS_KEY, JSON.stringify(toStore))
    return toStore
  }

  async resolveNamingModel(providerId: string): Promise<string | null> {
    const descriptors = await this.loadDescriptors()
    const descriptor = descriptors.find((item) => item.id === providerId)
    if (!descriptor) return null

    const stored = validateAgainst(
      parse(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )

    const override = stored.namingModelByProvider[providerId]
    if (override) return override

    if (descriptor.fastModelId) {
      const exists = descriptor.modelOptions.some(
        (option) => option.id === descriptor.fastModelId,
      )
      if (exists) return descriptor.fastModelId
    }

    return descriptor.defaultModelId ?? null
  }

  async resolveSessionDefaults(): Promise<ResolvedSessionDefaults | null> {
    const descriptors = await this.loadDescriptors()
    if (descriptors.length === 0) return null

    const stored = validateAgainst(
      parse(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )

    const provider =
      descriptors.find((item) => item.id === stored.defaultProviderId) ??
      descriptors[0]

    const model =
      provider.modelOptions.find((item) => item.id === stored.defaultModelId) ??
      provider.modelOptions.find(
        (item) => item.id === provider.defaultModelId,
      ) ??
      provider.modelOptions[0]

    if (!model) return null

    const effort =
      model.effortOptions.find((item) => item.id === stored.defaultEffortId) ??
      model.effortOptions.find((item) => item.id === model.defaultEffort) ??
      model.effortOptions.find((item) => item.id === 'medium') ??
      model.effortOptions[0]

    if (!effort) return null

    return {
      providerId: provider.id,
      modelId: model.id,
      effortId: effort.id,
    }
  }
}
