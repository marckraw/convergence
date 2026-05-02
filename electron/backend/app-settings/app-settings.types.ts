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
}

export type AppSettingsInput = Omit<
  AppSettings,
  | 'namingModelByProvider'
  | 'extractionModelByProvider'
  | 'notifications'
  | 'onboarding'
  | 'updates'
  | 'debugLogging'
> & {
  namingModelByProvider?: Record<string, string>
  extractionModelByProvider?: Record<string, string>
  notifications?: NotificationPrefs
  onboarding?: OnboardingPrefs
  updates?: UpdatePrefs
  debugLogging?: DebugLoggingPrefs
}

export interface ResolvedSessionDefaults {
  providerId: string
  modelId: string
  effortId: ReasoningEffort
}
