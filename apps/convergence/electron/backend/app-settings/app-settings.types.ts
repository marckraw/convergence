import type {
  ConfiguredExecutionHostEndpoint,
  ExecutionHostEndpointInput,
} from '../execution-host-endpoint/execution-host-endpoint.types'
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

export interface CommandCenterShortcutPrefs {
  key: string
  shiftKey: boolean
  altKey: boolean
}

export const DEFAULT_COMMAND_CENTER_SHORTCUT: CommandCenterShortcutPrefs = {
  key: 'k',
  shiftKey: false,
  altKey: false,
}

export interface AppSettings {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  commandCenterShortcut: CommandCenterShortcutPrefs
  /**
   * The machines other than this one that a session can run on (MAR-2620).
   *
   * Stored as rows rather than in the settings blob, and surfaced here because
   * every reader of "is a remote host configured?" already reads App Settings.
   * The list is the whole fact: there is no separate "the" base URL any more,
   * because there is no longer a single daemon for "the" to refer to.
   */
  executionHostEndpoints: ConfiguredExecutionHostEndpoint[]
  notifications: NotificationPrefs
  onboarding: OnboardingPrefs
  updates: UpdatePrefs
  debugLogging: DebugLoggingPrefs
  piModelVisibility: PiModelVisibilityPrefs
  favoriteModels: FavoriteModelsPrefs
}

/**
 * App Settings as the JSON blob in `app_state` stores them.
 *
 * Endpoints are the one setting that is not in the blob -- they are rows, so a
 * session can reference one by id -- and this type is what the pure parse and
 * validate functions therefore work on.
 */
export type StoredAppSettings = Omit<AppSettings, 'executionHostEndpoints'>

export type AppSettingsInput = Omit<
  AppSettings,
  | 'namingModelByProvider'
  | 'extractionModelByProvider'
  | 'commandCenterShortcut'
  | 'executionHostEndpoints'
  | 'notifications'
  | 'onboarding'
  | 'updates'
  | 'debugLogging'
  | 'piModelVisibility'
  | 'favoriteModels'
> & {
  namingModelByProvider?: Record<string, string>
  extractionModelByProvider?: Record<string, string>
  commandCenterShortcut?: CommandCenterShortcutPrefs
  executionHostEndpoints?: ExecutionHostEndpointInput[]
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

export interface ResolvedOneShotModelDefaults {
  modelId: string
  effortId: ReasoningEffort | null
}
