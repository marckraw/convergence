import type { NotificationPrefs } from '../notifications/notifications.types'
import type { ReasoningEffort } from '../provider/provider.types'

export interface OnboardingPrefs {
  notificationsCardDismissed: boolean
}

export const DEFAULT_ONBOARDING_PREFS: OnboardingPrefs = {
  notificationsCardDismissed: false,
}

export interface AppSettings {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  notifications: NotificationPrefs
  onboarding: OnboardingPrefs
}

export type AppSettingsInput = Omit<
  AppSettings,
  | 'namingModelByProvider'
  | 'extractionModelByProvider'
  | 'notifications'
  | 'onboarding'
> & {
  namingModelByProvider?: Record<string, string>
  extractionModelByProvider?: Record<string, string>
  notifications?: NotificationPrefs
  onboarding?: OnboardingPrefs
}

export interface ResolvedSessionDefaults {
  providerId: string
  modelId: string
  effortId: ReasoningEffort
}
