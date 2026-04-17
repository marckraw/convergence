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

function parse(raw: string | null): AppSettings {
  const empty: AppSettings = {
    defaultProviderId: null,
    defaultModelId: null,
    defaultEffortId: null,
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
    }
  } catch {
    return empty
  }
}

function validateAgainst(
  settings: AppSettings,
  descriptors: ProviderDescriptor[],
): AppSettings {
  const provider = descriptors.find(
    (item) => item.id === settings.defaultProviderId,
  )
  if (!provider) {
    return {
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
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
    }
  }

  const effort = model.effortOptions.find(
    (item) => item.id === settings.defaultEffortId,
  )
  return {
    defaultProviderId: provider.id,
    defaultModelId: model.id,
    defaultEffortId: effort ? effort.id : null,
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

    const toStore: AppSettings = {
      defaultProviderId: provider ? provider.id : null,
      defaultModelId: model ? model.id : null,
      defaultEffortId:
        model && input.defaultEffortId !== null ? input.defaultEffortId : null,
    }

    this.stateService.set(APP_SETTINGS_KEY, JSON.stringify(toStore))
    return toStore
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
