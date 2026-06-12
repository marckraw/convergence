import type { NotificationPrefs } from '../notifications/notifications.types'
import type { StateService } from '../state/state.service'
import type { ProviderDescriptor } from '../provider/provider.types'
import type { UpdatePrefs } from '../updates/updates.types'
import {
  type AppSettings,
  type AppSettingsInput,
  type DebugLoggingPrefs,
  type ResolvedOneShotModelDefaults,
  type ResolvedSessionDefaults,
} from './app-settings.types'
import { APP_SETTINGS_KEY } from './app-settings.constants'
import {
  filterPiDescriptor,
  normalizeGuidedReviewRemoteBaseUrl,
  parseAppSettings,
  parseCommandCenterShortcut,
  parseDebugLoggingPrefs,
  parseFavoriteModelsPrefs,
  parseNotificationPrefs,
  parseOnboardingPrefs,
  parsePiModelVisibilityPrefs,
  parseUpdatePrefs,
  resolveGuidedReviewModelFromSettings,
  resolveSessionDefaultsFromSettings,
  validateAppSettings,
  validateCommandCenterShortcut,
  validateFavoriteModels,
  validateModelMap,
  validatePiModelVisibility,
} from './app-settings.pure'

type ProviderDescriptorLoader = () => Promise<ProviderDescriptor[]>

export class AppSettingsService {
  constructor(
    private readonly stateService: StateService,
    private readonly loadDescriptors: ProviderDescriptorLoader,
  ) {}

  async getAppSettings(): Promise<AppSettings> {
    const raw = this.stateService.get(APP_SETTINGS_KEY)
    const parsed = parseAppSettings(raw)
    const descriptors = await this.loadDescriptors()
    return validateAppSettings(parsed, descriptors)
  }

  getNotificationPrefsSync(): NotificationPrefs {
    return parseAppSettings(this.stateService.get(APP_SETTINGS_KEY))
      .notifications
  }

  getUpdatePrefsSync(): UpdatePrefs {
    return parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)).updates
  }

  getDebugLoggingPrefsSync(): DebugLoggingPrefs {
    return parseAppSettings(this.stateService.get(APP_SETTINGS_KEY))
      .debugLogging
  }

  filterProviderDescriptors(
    descriptors: ProviderDescriptor[],
  ): ProviderDescriptor[] {
    const settings = validateAppSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
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
    const guidedReviewModelByProvider = validateModelMap(
      input.guidedReviewModelByProvider ?? {},
      descriptors,
    )

    const existing = parseAppSettings(this.stateService.get(APP_SETTINGS_KEY))
    const guidedReviewBackend =
      input.guidedReviewBackend ?? existing.guidedReviewBackend
    const guidedReviewRemoteBaseUrl =
      input.guidedReviewRemoteBaseUrl === undefined
        ? existing.guidedReviewRemoteBaseUrl
        : normalizeGuidedReviewRemoteBaseUrl(input.guidedReviewRemoteBaseUrl)
    if (
      input.guidedReviewRemoteBaseUrl !== undefined &&
      input.guidedReviewRemoteBaseUrl !== null &&
      !guidedReviewRemoteBaseUrl
    ) {
      throw new Error('Remote daemon base URL must be an HTTP(S) URL.')
    }
    if (guidedReviewBackend === 'remote' && !guidedReviewRemoteBaseUrl) {
      throw new Error('Remote guided review requires a daemon base URL.')
    }

    const executionHostRemoteBaseUrl =
      input.executionHostRemoteBaseUrl === undefined
        ? existing.executionHostRemoteBaseUrl
        : normalizeGuidedReviewRemoteBaseUrl(input.executionHostRemoteBaseUrl)
    if (
      input.executionHostRemoteBaseUrl !== undefined &&
      input.executionHostRemoteBaseUrl !== null &&
      !executionHostRemoteBaseUrl
    ) {
      throw new Error('Remote execution host base URL must be an HTTP(S) URL.')
    }

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
    const commandCenterShortcut =
      input.commandCenterShortcut === undefined
        ? existing.commandCenterShortcut
        : (() => {
            const parsed = parseCommandCenterShortcut(
              input.commandCenterShortcut,
            )
            const validated = validateCommandCenterShortcut(parsed)
            if (!validated) {
              throw new Error(
                'Command Center shortcut must use a single letter or number key.',
              )
            }
            return validated
          })()

    const toStore: AppSettings = {
      defaultProviderId: provider ? provider.id : null,
      defaultModelId: model ? model.id : null,
      defaultEffortId:
        model && input.defaultEffortId !== null ? input.defaultEffortId : null,
      namingModelByProvider,
      extractionModelByProvider,
      guidedReviewModelByProvider,
      commandCenterShortcut,
      guidedReviewBackend,
      guidedReviewRemoteBaseUrl,
      executionHostRemoteBaseUrl,
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

    const stored = validateAppSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
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

  async resolveExtractionModel(
    providerId: string,
    options: { preferFastDefault?: boolean } = {},
  ): Promise<string | null> {
    const descriptors = await this.loadDescriptors()
    const descriptor = descriptors.find((item) => item.id === providerId)
    if (!descriptor) return null

    const stored = validateAppSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )

    const override = stored.extractionModelByProvider[providerId]
    if (override) return override

    if (options.preferFastDefault && descriptor.fastModelId) {
      const exists = descriptor.modelOptions.some(
        (option) => option.id === descriptor.fastModelId,
      )
      if (exists) return descriptor.fastModelId
    }

    return descriptor.defaultModelId ?? null
  }

  async resolveGuidedReviewModel(
    providerId: string,
  ): Promise<ResolvedOneShotModelDefaults | null> {
    const descriptors = await this.loadDescriptors()
    const descriptor = descriptors.find((item) => item.id === providerId)
    if (!descriptor) return null

    return resolveGuidedReviewModelFromSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
      descriptor,
    )
  }

  async resolveSessionDefaults(): Promise<ResolvedSessionDefaults | null> {
    const descriptors = await this.loadDescriptors()
    return resolveSessionDefaultsFromSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )
  }
}
