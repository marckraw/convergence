import type { ReasoningEffort } from '../session'

export interface AppSettings {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
}

export type AppSettingsInput = AppSettings
