import type {
  NotificationEventPrefs,
  NotificationPrefs,
} from '../notifications'
import type { ReasoningEffort } from '../session'
import type { UpdatePrefs } from '../updates'
import type { KeyboardShortcutBinding } from '@/shared/lib/keyboard-shortcut.pure'
import { DEFAULT_COMMAND_CENTER_SHORTCUT } from '@/shared/lib/keyboard-shortcut.pure'

export type CommandCenterShortcutPrefs = KeyboardShortcutBinding

export { DEFAULT_COMMAND_CENTER_SHORTCUT }

export type { NotificationEventPrefs, NotificationPrefs, UpdatePrefs }
export { DEFAULT_NOTIFICATION_PREFS } from '../notifications'
export { DEFAULT_UPDATE_PREFS } from '../updates'

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

export type GuidedReviewBackend = 'local' | 'remote'

export const DEFAULT_GUIDED_REVIEW_BACKEND: GuidedReviewBackend = 'local'

export interface AppSettings {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  guidedReviewModelByProvider: Record<string, string>
  commandCenterShortcut: CommandCenterShortcutPrefs
  guidedReviewBackend: GuidedReviewBackend
  guidedReviewRemoteBaseUrl: string | null
  executionHostRemoteBaseUrl: string | null
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
  | 'guidedReviewModelByProvider'
  | 'commandCenterShortcut'
  | 'guidedReviewBackend'
  | 'guidedReviewRemoteBaseUrl'
  | 'executionHostRemoteBaseUrl'
  | 'notifications'
  | 'onboarding'
  | 'updates'
  | 'debugLogging'
  | 'piModelVisibility'
  | 'favoriteModels'
> & {
  namingModelByProvider?: Record<string, string>
  extractionModelByProvider?: Record<string, string>
  guidedReviewModelByProvider?: Record<string, string>
  commandCenterShortcut?: CommandCenterShortcutPrefs
  guidedReviewBackend?: GuidedReviewBackend
  guidedReviewRemoteBaseUrl?: string | null
  executionHostRemoteBaseUrl?: string | null
  notifications?: NotificationPrefs
  onboarding?: OnboardingPrefs
  updates?: UpdatePrefs
  debugLogging?: DebugLoggingPrefs
  piModelVisibility?: PiModelVisibilityPrefs
  favoriteModels?: FavoriteModelsPrefs
}

export interface OpenRouterCredentialStatus {
  providerId: 'openrouter'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

export interface GuidedReviewDaemonCredentialStatus {
  providerId: 'guided-review-daemon'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

export interface ExecutionHostDaemonCredentialStatus {
  providerId: 'execution-host-daemon'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

export type RemoteExecutionHostConnectionState =
  | 'connected'
  | 'missing-base-url'
  | 'invalid-base-url'
  | 'missing-token'
  | 'unreachable'
  | 'auth-failed'
  | 'invalid-response'
  | 'daemon-error'

export interface RemoteExecutionHostProviderSummary {
  providerId: string
  name: string
  available: boolean
  authenticated: boolean
  supportsContinuation: boolean
  models: { id: string; label: string }[]
}

export interface RemoteExecutionHostConnectionResult {
  ok: boolean
  state: RemoteExecutionHostConnectionState
  baseUrl: string | null
  message: string
  providers: RemoteExecutionHostProviderSummary[] | null
}
