import type {
  NotificationEventPrefs,
  NotificationPrefs,
} from '../notifications'
import type { ReasoningEffort } from '../session'
import type { UpdatePrefs } from '../updates'

export type { NotificationEventPrefs, NotificationPrefs, UpdatePrefs }
export { DEFAULT_NOTIFICATION_PREFS } from '../notifications'
export { DEFAULT_UPDATE_PREFS } from '../updates'

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
  updates: UpdatePrefs
}

export type AppSettingsInput = AppSettings
