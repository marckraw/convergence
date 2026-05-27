import type { NotificationPrefs } from '../notifications/notifications.types'
import type { ReasoningEffort } from '../provider/provider.types'
import type { UpdatePrefs } from '../updates/updates.types'

export interface OnboardingPrefs {
  notificationsCardDismissed: boolean
}

export const DEFAULT_ONBOARDING_PREFS: OnboardingPrefs = {
  notificationsCardDismissed: false,
}

export interface DebugLoggingPrefs {
  enabled: boolean
}

export const DEFAULT_DEBUG_LOGGING_PREFS: DebugLoggingPrefs = {
  enabled: false,
}

export interface PiModelVisibilityPrefs {
  additionalModelIds: string[]
}

export const DEFAULT_PI_MODEL_VISIBILITY_PREFS: PiModelVisibilityPrefs = {
  additionalModelIds: [],
}

export interface FavoriteModelRef {
  providerId: string
  modelId: string
}

export interface FavoriteModelsPrefs {
  items: FavoriteModelRef[]
}

export const DEFAULT_FAVORITE_MODELS_PREFS: FavoriteModelsPrefs = {
  items: [],
}

export interface AppSettings {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  notifications: NotificationPrefs
  onboarding: OnboardingPrefs
  updates: UpdatePrefs
  debugLogging: DebugLoggingPrefs
  piModelVisibility: PiModelVisibilityPrefs
  favoriteModels: FavoriteModelsPrefs
}

export type AppSettingsInput = Omit<
  AppSettings,
  | 'namingModelByProvider'
  | 'extractionModelByProvider'
  | 'notifications'
  | 'onboarding'
  | 'updates'
  | 'debugLogging'
  | 'piModelVisibility'
  | 'favoriteModels'
> & {
  namingModelByProvider?: Record<string, string>
  extractionModelByProvider?: Record<string, string>
  notifications?: NotificationPrefs
  onboarding?: OnboardingPrefs
  updates?: UpdatePrefs
  debugLogging?: DebugLoggingPrefs
  piModelVisibility?: PiModelVisibilityPrefs
  favoriteModels?: FavoriteModelsPrefs
}

export interface ResolvedSessionDefaults {
  providerId: string
  modelId: string
  effortId: ReasoningEffort
}
