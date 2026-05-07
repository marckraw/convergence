import type {
  AppSettings,
  AppSettingsInput,
  OpenRouterCredentialStatus,
} from './app-settings.types'

export const appSettingsApi = {
  get: (): Promise<AppSettings> => window.electronAPI.appSettings.get(),

  set: (input: AppSettingsInput): Promise<AppSettings> =>
    window.electronAPI.appSettings.set(input),

  onUpdated: (callback: (settings: AppSettings) => void): (() => void) =>
    window.electronAPI.appSettings.onUpdated(callback),
}

export const openRouterCredentialsApi = {
  getStatus: (): Promise<OpenRouterCredentialStatus> =>
    window.electronAPI.credentials.openRouter.getStatus(),

  setToken: (token: string): Promise<OpenRouterCredentialStatus> =>
    window.electronAPI.credentials.openRouter.setToken(token),

  deleteToken: (): Promise<OpenRouterCredentialStatus> =>
    window.electronAPI.credentials.openRouter.deleteToken(),
}
