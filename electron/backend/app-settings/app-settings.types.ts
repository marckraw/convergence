import type { ReasoningEffort } from '../provider/provider.types'

export interface AppSettings {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
}

export type AppSettingsInput = Omit<AppSettings, 'namingModelByProvider'> & {
  namingModelByProvider?: Record<string, string>
}

export interface ResolvedSessionDefaults {
  providerId: string
  modelId: string
  effortId: ReasoningEffort
}
