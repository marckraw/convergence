import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/notifications.defaults'
import type { NotificationPrefs } from '../notifications/notifications.types'
import type { StateService } from '../state/state.service'
import type {
  ProviderDescriptor,
  ReasoningEffort,
} from '../provider/provider.types'
import { DEFAULT_UPDATE_PREFS } from '../updates/updates.defaults'
import type { UpdatePrefs } from '../updates/updates.types'
import {
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_FAVORITE_MODELS_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_PI_MODEL_VISIBILITY_PREFS,
  type AppSettings,
  type AppSettingsInput,
  type DebugLoggingPrefs,
  type FavoriteModelsPrefs,
  type OnboardingPrefs,
  type PiModelVisibilityPrefs,
  type ResolvedSessionDefaults,
} from './app-settings.types'
import { normalizeProviderDescriptor } from '../provider/provider-descriptor.pure'

export const APP_SETTINGS_KEY = 'app_settings'

type ProviderDescriptorLoader = () => Promise<ProviderDescriptor[]>

function parseModelMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>).flatMap(
    ([providerId, modelId]) =>
      typeof modelId === 'string' && modelId.length > 0
        ? [[providerId, modelId] as const]
        : [],
  )
  return Object.fromEntries(entries)
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function parseNotificationPrefs(value: unknown): NotificationPrefs {
  if (!value || typeof value !== 'object') return DEFAULT_NOTIFICATION_PREFS
  const raw = value as Partial<NotificationPrefs> & {
    events?: Partial<NotificationPrefs['events']>
  }
  const eventsRaw =
    raw.events && typeof raw.events === 'object'
      ? raw.events
      : DEFAULT_NOTIFICATION_PREFS.events
  return {
    enabled: pickBoolean(raw.enabled, DEFAULT_NOTIFICATION_PREFS.enabled),
    toasts: pickBoolean(raw.toasts, DEFAULT_NOTIFICATION_PREFS.toasts),
    sounds: pickBoolean(raw.sounds, DEFAULT_NOTIFICATION_PREFS.sounds),
    system: pickBoolean(raw.system, DEFAULT_NOTIFICATION_PREFS.system),
    dockBadge: pickBoolean(raw.dockBadge, DEFAULT_NOTIFICATION_PREFS.dockBadge),
    dockBounce: pickBoolean(
      raw.dockBounce,
      DEFAULT_NOTIFICATION_PREFS.dockBounce,
    ),
    suppressWhenFocused: pickBoolean(
      raw.suppressWhenFocused,
      DEFAULT_NOTIFICATION_PREFS.suppressWhenFocused,
    ),
    events: {
      finished: pickBoolean(
        eventsRaw.finished,
        DEFAULT_NOTIFICATION_PREFS.events.finished,
      ),
      needsInput: pickBoolean(
        eventsRaw.needsInput,
        DEFAULT_NOTIFICATION_PREFS.events.needsInput,
      ),
      needsApproval: pickBoolean(
        eventsRaw.needsApproval,
        DEFAULT_NOTIFICATION_PREFS.events.needsApproval,
      ),
      errored: pickBoolean(
        eventsRaw.errored,
        DEFAULT_NOTIFICATION_PREFS.events.errored,
      ),
      terminalIdle: pickBoolean(
        eventsRaw.terminalIdle,
        DEFAULT_NOTIFICATION_PREFS.events.terminalIdle,
      ),
    },
  }
}

function parseOnboardingPrefs(value: unknown): OnboardingPrefs {
  if (!value || typeof value !== 'object') return DEFAULT_ONBOARDING_PREFS
  const raw = value as Partial<OnboardingPrefs>
  return {
    notificationsCardDismissed: pickBoolean(
      raw.notificationsCardDismissed,
      DEFAULT_ONBOARDING_PREFS.notificationsCardDismissed,
    ),
  }
}

function parseUpdatePrefs(value: unknown): UpdatePrefs {
  if (!value || typeof value !== 'object') return DEFAULT_UPDATE_PREFS
  const raw = value as Partial<UpdatePrefs>
  return {
    backgroundCheckEnabled: pickBoolean(
      raw.backgroundCheckEnabled,
      DEFAULT_UPDATE_PREFS.backgroundCheckEnabled,
    ),
  }
}

function parseDebugLoggingPrefs(value: unknown): DebugLoggingPrefs {
  if (!value || typeof value !== 'object') return DEFAULT_DEBUG_LOGGING_PREFS
  const raw = value as Partial<DebugLoggingPrefs>
  return {
    enabled: pickBoolean(raw.enabled, DEFAULT_DEBUG_LOGGING_PREFS.enabled),
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => !!item))]
}

function parsePiModelVisibilityPrefs(value: unknown): PiModelVisibilityPrefs {
  if (!value || typeof value !== 'object') {
    return DEFAULT_PI_MODEL_VISIBILITY_PREFS
  }
  const raw = value as Partial<PiModelVisibilityPrefs>
  return {
    additionalModelIds: parseStringArray(raw.additionalModelIds),
  }
}

function parseFavoriteModelsPrefs(value: unknown): FavoriteModelsPrefs {
  if (!value || typeof value !== 'object') {
    return DEFAULT_FAVORITE_MODELS_PREFS
  }
  const raw = value as Partial<FavoriteModelsPrefs>
  if (!Array.isArray(raw.items)) return DEFAULT_FAVORITE_MODELS_PREFS

  const seen = new Set<string>()
  const items = raw.items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as { providerId?: unknown; modelId?: unknown }
    if (
      typeof candidate.providerId !== 'string' ||
      candidate.providerId.length === 0 ||
      typeof candidate.modelId !== 'string' ||
      candidate.modelId.length === 0
    ) {
      return []
    }

    const key = `${candidate.providerId}\0${candidate.modelId}`
    if (seen.has(key)) return []
    seen.add(key)

    return [
      {
        providerId: candidate.providerId,
        modelId: candidate.modelId,
      },
    ]
  })

  return { items }
}

function parse(raw: string | null): AppSettings {
  const empty: AppSettings = {
    defaultProviderId: null,
    defaultModelId: null,
    defaultEffortId: null,
    namingModelByProvider: {},
    extractionModelByProvider: {},
    notifications: DEFAULT_NOTIFICATION_PREFS,
    onboarding: DEFAULT_ONBOARDING_PREFS,
    updates: DEFAULT_UPDATE_PREFS,
    debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
    piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
    favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
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
      namingModelByProvider: parseModelMap(parsed.namingModelByProvider),
      extractionModelByProvider: parseModelMap(
        parsed.extractionModelByProvider,
      ),
      notifications: parseNotificationPrefs(parsed.notifications),
      onboarding: parseOnboardingPrefs(parsed.onboarding),
      updates: parseUpdatePrefs(parsed.updates),
      debugLogging: parseDebugLoggingPrefs(parsed.debugLogging),
      piModelVisibility: parsePiModelVisibilityPrefs(parsed.piModelVisibility),
      favoriteModels: parseFavoriteModelsPrefs(parsed.favoriteModels),
    }
  } catch {
    return empty
  }
}

function validateModelMap(
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
  const namingModelByProvider = validateModelMap(
    settings.namingModelByProvider,
    descriptors,
  )
  const extractionModelByProvider = validateModelMap(
    settings.extractionModelByProvider,
    descriptors,
  )
  const favoriteModels = validateFavoriteModels(
    settings.favoriteModels,
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
      extractionModelByProvider,
      notifications: settings.notifications,
      onboarding: settings.onboarding,
      updates: settings.updates,
      debugLogging: settings.debugLogging,
      piModelVisibility: validatePiModelVisibility(
        settings.piModelVisibility,
        descriptors,
      ),
      favoriteModels,
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
      extractionModelByProvider,
      notifications: settings.notifications,
      onboarding: settings.onboarding,
      updates: settings.updates,
      debugLogging: settings.debugLogging,
      piModelVisibility: validatePiModelVisibility(
        settings.piModelVisibility,
        descriptors,
      ),
      favoriteModels,
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
    extractionModelByProvider,
    notifications: settings.notifications,
    onboarding: settings.onboarding,
    updates: settings.updates,
    debugLogging: settings.debugLogging,
    piModelVisibility: validatePiModelVisibility(
      settings.piModelVisibility,
      descriptors,
    ),
    favoriteModels,
  }
}

function validateFavoriteModels(
  prefs: FavoriteModelsPrefs,
  descriptors: ProviderDescriptor[],
): FavoriteModelsPrefs {
  const modelIdsByProvider = new Map(
    descriptors.map((descriptor) => [
      descriptor.id,
      new Set(descriptor.modelOptions.map((option) => option.id)),
    ]),
  )
  return {
    items: prefs.items.filter((item) =>
      modelIdsByProvider.get(item.providerId)?.has(item.modelId),
    ),
  }
}

function validatePiModelVisibility(
  prefs: PiModelVisibilityPrefs,
  descriptors: ProviderDescriptor[],
): PiModelVisibilityPrefs {
  const pi = descriptors.find((descriptor) => descriptor.id === 'pi')
  if (!pi) return DEFAULT_PI_MODEL_VISIBILITY_PREFS

  const availableIds = new Set(pi.modelOptions.map((option) => option.id))
  const additionalModelIds = [
    ...new Set(
      prefs.additionalModelIds.flatMap((id) => {
        const normalizedId = normalizePiModelVisibilityId(id, availableIds)
        return normalizedId ? [normalizedId] : []
      }),
    ),
  ]

  return { additionalModelIds }
}

function normalizePiModelVisibilityId(
  id: string,
  availableIds: Set<string>,
): string | null {
  if (availableIds.has(id)) return id

  const legacyCodexPrefix = 'openai-codex/'
  if (id.startsWith(legacyCodexPrefix)) {
    const currentCopilotId = `github-copilot/${id.slice(legacyCodexPrefix.length)}`
    if (availableIds.has(currentCopilotId)) return currentCopilotId
  }

  return null
}

function filterPiDescriptor(
  descriptor: ProviderDescriptor,
  prefs: PiModelVisibilityPrefs,
): ProviderDescriptor {
  if (descriptor.id !== 'pi') return descriptor

  const modelsJsonOptions = descriptor.modelOptions.filter(
    (option) => option.source === 'pi-models-json',
  )
  const availableIds = new Set(
    descriptor.modelOptions.map((option) => option.id),
  )
  const selectedIds = new Set(
    prefs.additionalModelIds.flatMap((id) => {
      const normalizedId = normalizePiModelVisibilityId(id, availableIds)
      return normalizedId ? [normalizedId] : []
    }),
  )
  const shouldFilter = modelsJsonOptions.length > 0 || selectedIds.size > 0
  if (!shouldFilter) return descriptor

  const modelOptions = descriptor.modelOptions.filter(
    (option) =>
      option.source === 'pi-models-json' || selectedIds.has(option.id),
  )
  if (modelOptions.length === 0) return descriptor

  return normalizeProviderDescriptor({
    ...descriptor,
    defaultModelId: modelOptions.some(
      (option) => option.id === descriptor.defaultModelId,
    )
      ? descriptor.defaultModelId
      : modelOptions[0]!.id,
    fastModelId:
      descriptor.fastModelId &&
      modelOptions.some((option) => option.id === descriptor.fastModelId)
        ? descriptor.fastModelId
        : null,
    modelOptions,
  })
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

  getNotificationPrefsSync(): NotificationPrefs {
    return parse(this.stateService.get(APP_SETTINGS_KEY)).notifications
  }

  getUpdatePrefsSync(): UpdatePrefs {
    return parse(this.stateService.get(APP_SETTINGS_KEY)).updates
  }

  getDebugLoggingPrefsSync(): DebugLoggingPrefs {
    return parse(this.stateService.get(APP_SETTINGS_KEY)).debugLogging
  }

  filterProviderDescriptors(
    descriptors: ProviderDescriptor[],
  ): ProviderDescriptor[] {
    const settings = validateAgainst(
      parse(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )
    return descriptors.map((descriptor) =>
      filterPiDescriptor(descriptor, settings.piModelVisibility),
    )
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

    const namingModelByProvider = validateModelMap(
      input.namingModelByProvider ?? {},
      descriptors,
    )
    const extractionModelByProvider = validateModelMap(
      input.extractionModelByProvider ?? {},
      descriptors,
    )

    const existing = parse(this.stateService.get(APP_SETTINGS_KEY))
    const notifications =
      input.notifications === undefined
        ? existing.notifications
        : parseNotificationPrefs(input.notifications)
    const onboarding =
      input.onboarding === undefined
        ? existing.onboarding
        : parseOnboardingPrefs(input.onboarding)
    const updates =
      input.updates === undefined
        ? existing.updates
        : parseUpdatePrefs(input.updates)
    const debugLogging =
      input.debugLogging === undefined
        ? existing.debugLogging
        : parseDebugLoggingPrefs(input.debugLogging)
    const piModelVisibility =
      input.piModelVisibility === undefined
        ? existing.piModelVisibility
        : validatePiModelVisibility(
            parsePiModelVisibilityPrefs(input.piModelVisibility),
            descriptors,
          )
    const favoriteModels =
      input.favoriteModels === undefined
        ? validateFavoriteModels(existing.favoriteModels, descriptors)
        : validateFavoriteModels(
            parseFavoriteModelsPrefs(input.favoriteModels),
            descriptors,
          )

    const toStore: AppSettings = {
      defaultProviderId: provider ? provider.id : null,
      defaultModelId: model ? model.id : null,
      defaultEffortId:
        model && input.defaultEffortId !== null ? input.defaultEffortId : null,
      namingModelByProvider,
      extractionModelByProvider,
      notifications,
      onboarding,
      updates,
      debugLogging,
      piModelVisibility,
      favoriteModels,
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

  async resolveExtractionModel(providerId: string): Promise<string | null> {
    const descriptors = await this.loadDescriptors()
    const descriptor = descriptors.find((item) => item.id === providerId)
    if (!descriptor) return null

    const stored = validateAgainst(
      parse(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )

    const override = stored.extractionModelByProvider[providerId]
    if (override) return override

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
