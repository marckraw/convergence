import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/notifications.defaults'
import type { NotificationPrefs } from '../notifications/notifications.types'
import type { StateService } from '../state/state.service'
import type {
  ProviderDescriptor,
  ReasoningEffort,
} from '../provider/provider.types'
import {
  DEFAULT_ONBOARDING_PREFS,
  type AppSettings,
  type AppSettingsInput,
  type OnboardingPrefs,
  type ResolvedSessionDefaults,
} from './app-settings.types'

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

function parse(raw: string | null): AppSettings {
  const empty: AppSettings = {
    defaultProviderId: null,
    defaultModelId: null,
    defaultEffortId: null,
    namingModelByProvider: {},
    extractionModelByProvider: {},
    notifications: DEFAULT_NOTIFICATION_PREFS,
    onboarding: DEFAULT_ONBOARDING_PREFS,
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

  getNotificationPrefsSync(): NotificationPrefs {
    return parse(this.stateService.get(APP_SETTINGS_KEY)).notifications
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

    const toStore: AppSettings = {
      defaultProviderId: provider ? provider.id : null,
      defaultModelId: model ? model.id : null,
      defaultEffortId:
        model && input.defaultEffortId !== null ? input.defaultEffortId : null,
      namingModelByProvider,
      extractionModelByProvider,
      notifications,
      onboarding,
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
