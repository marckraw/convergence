import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/notifications.defaults'
import type { NotificationPrefs } from '../notifications/notifications.types'
import { normalizeProviderDescriptor } from '../provider/provider-descriptor.pure'
import type {
  ProviderDescriptor,
  ReasoningEffort,
} from '../provider/provider.types'
import { DEFAULT_UPDATE_PREFS } from '../updates/updates.defaults'
import type { UpdatePrefs } from '../updates/updates.types'
import {
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_FAVORITE_MODELS_PREFS,
  DEFAULT_GUIDED_REVIEW_BACKEND,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_PI_MODEL_VISIBILITY_PREFS,
  type AppSettings,
  type DebugLoggingPrefs,
  type FavoriteModelsPrefs,
  type GuidedReviewBackend,
  type OnboardingPrefs,
  type PiModelVisibilityPrefs,
  type ResolvedOneShotModelDefaults,
  type ResolvedSessionDefaults,
  DEFAULT_COMMAND_CENTER_SHORTCUT,
} from './app-settings.types'
import {
  parseCommandCenterShortcut,
  validateCommandCenterShortcut,
} from '../../../src/shared/lib/keyboard-shortcut.pure'

export function parseModelMap(value: unknown): Record<string, string> {
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

export function parseNotificationPrefs(value: unknown): NotificationPrefs {
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

export function parseOnboardingPrefs(value: unknown): OnboardingPrefs {
  if (!value || typeof value !== 'object') return DEFAULT_ONBOARDING_PREFS
  const raw = value as Partial<OnboardingPrefs>
  return {
    notificationsCardDismissed: pickBoolean(
      raw.notificationsCardDismissed,
      DEFAULT_ONBOARDING_PREFS.notificationsCardDismissed,
    ),
  }
}

export function parseUpdatePrefs(value: unknown): UpdatePrefs {
  if (!value || typeof value !== 'object') return DEFAULT_UPDATE_PREFS
  const raw = value as Partial<UpdatePrefs>
  return {
    backgroundCheckEnabled: pickBoolean(
      raw.backgroundCheckEnabled,
      DEFAULT_UPDATE_PREFS.backgroundCheckEnabled,
    ),
  }
}

export function parseDebugLoggingPrefs(value: unknown): DebugLoggingPrefs {
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

export function parsePiModelVisibilityPrefs(
  value: unknown,
): PiModelVisibilityPrefs {
  if (!value || typeof value !== 'object') {
    return DEFAULT_PI_MODEL_VISIBILITY_PREFS
  }
  const raw = value as Partial<PiModelVisibilityPrefs>
  return {
    additionalModelIds: parseStringArray(raw.additionalModelIds),
  }
}

export function parseFavoriteModelsPrefs(value: unknown): FavoriteModelsPrefs {
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

export { parseCommandCenterShortcut, validateCommandCenterShortcut }

export function parseGuidedReviewBackend(value: unknown): GuidedReviewBackend {
  return value === 'remote' ? 'remote' : DEFAULT_GUIDED_REVIEW_BACKEND
}

/**
 * Normalizes a remote daemon base URL setting: trims, requires HTTP(S), and
 * strips trailing slashes. Shared by the guided review and execution host
 * remote endpoints.
 */
export function normalizeGuidedReviewRemoteBaseUrl(
  value: unknown,
): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.href.replace(/\/+$/, '')
  } catch {
    return null
  }
}

function emptyAppSettings(): AppSettings {
  return {
    defaultProviderId: null,
    defaultModelId: null,
    defaultEffortId: null,
    namingModelByProvider: {},
    extractionModelByProvider: {},
    guidedReviewModelByProvider: {},
    commandCenterShortcut: DEFAULT_COMMAND_CENTER_SHORTCUT,
    guidedReviewBackend: DEFAULT_GUIDED_REVIEW_BACKEND,
    guidedReviewRemoteBaseUrl: null,
    executionHostRemoteBaseUrl: null,
    notifications: DEFAULT_NOTIFICATION_PREFS,
    onboarding: DEFAULT_ONBOARDING_PREFS,
    updates: DEFAULT_UPDATE_PREFS,
    debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
    piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
    favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
  }
}

export function parseAppSettings(raw: string | null): AppSettings {
  const empty = emptyAppSettings()
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
      guidedReviewModelByProvider: parseModelMap(
        parsed.guidedReviewModelByProvider,
      ),
      commandCenterShortcut: parseCommandCenterShortcut(
        parsed.commandCenterShortcut,
      ),
      guidedReviewBackend: parseGuidedReviewBackend(parsed.guidedReviewBackend),
      guidedReviewRemoteBaseUrl: normalizeGuidedReviewRemoteBaseUrl(
        parsed.guidedReviewRemoteBaseUrl,
      ),
      executionHostRemoteBaseUrl: normalizeGuidedReviewRemoteBaseUrl(
        parsed.executionHostRemoteBaseUrl,
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

export function validateModelMap(
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

export function validateAppSettings(
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
  const guidedReviewModelByProvider = validateModelMap(
    settings.guidedReviewModelByProvider,
    descriptors,
  )
  const favoriteModels = validateFavoriteModels(
    settings.favoriteModels,
    descriptors,
  )
  const commandCenterShortcut =
    validateCommandCenterShortcut(settings.commandCenterShortcut) ??
    DEFAULT_COMMAND_CENTER_SHORTCUT

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
      guidedReviewModelByProvider,
      commandCenterShortcut,
      guidedReviewBackend: settings.guidedReviewBackend,
      guidedReviewRemoteBaseUrl: settings.guidedReviewRemoteBaseUrl,
      executionHostRemoteBaseUrl: settings.executionHostRemoteBaseUrl,
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
      guidedReviewModelByProvider,
      commandCenterShortcut,
      guidedReviewBackend: settings.guidedReviewBackend,
      guidedReviewRemoteBaseUrl: settings.guidedReviewRemoteBaseUrl,
      executionHostRemoteBaseUrl: settings.executionHostRemoteBaseUrl,
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
    guidedReviewModelByProvider,
    commandCenterShortcut,
    guidedReviewBackend: settings.guidedReviewBackend,
    guidedReviewRemoteBaseUrl: settings.guidedReviewRemoteBaseUrl,
    executionHostRemoteBaseUrl: settings.executionHostRemoteBaseUrl,
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

export function validateFavoriteModels(
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

export function validatePiModelVisibility(
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

export function normalizePiModelVisibilityId(
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

export function filterPiDescriptor(
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

export function resolveSessionDefaultsFromSettings(
  settings: AppSettings,
  descriptors: ProviderDescriptor[],
): ResolvedSessionDefaults | null {
  if (descriptors.length === 0) return null

  const stored = validateAppSettings(settings, descriptors)
  const provider =
    descriptors.find((item) => item.id === stored.defaultProviderId) ??
    descriptors[0]

  const model =
    provider.modelOptions.find((item) => item.id === stored.defaultModelId) ??
    provider.modelOptions.find((item) => item.id === provider.defaultModelId) ??
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

export function resolveGuidedReviewModelFromSettings(
  settings: AppSettings,
  descriptor: ProviderDescriptor,
): ResolvedOneShotModelDefaults | null {
  const stored = validateAppSettings(settings, [descriptor])
  const preferredModelId =
    stored.guidedReviewModelByProvider[descriptor.id] ??
    preferredGuidedReviewModelId(descriptor)
  const model =
    descriptor.modelOptions.find((item) => item.id === preferredModelId) ??
    descriptor.modelOptions.find(
      (item) => item.id === descriptor.defaultModelId,
    ) ??
    descriptor.modelOptions[0]

  if (!model) return null

  const effort =
    model.effortOptions.find((item) => item.id === 'medium') ??
    model.effortOptions.find((item) => item.id === model.defaultEffort) ??
    model.effortOptions[0] ??
    null

  return {
    modelId: model.id,
    effortId: effort?.id ?? null,
  }
}

export function preferredGuidedReviewModelId(
  descriptor: ProviderDescriptor,
): string | null {
  const preferredByProvider: Record<string, string> = {
    'claude-code': 'opus',
    codex: 'gpt-5.5',
  }
  const preferred = preferredByProvider[descriptor.id]
  if (
    preferred &&
    descriptor.modelOptions.some((option) => option.id === preferred)
  ) {
    return preferred
  }
  return descriptor.defaultModelId
}
