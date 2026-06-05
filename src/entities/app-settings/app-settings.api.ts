import type {
  AppSettings,
  AppSettingsInput,
  GuidedReviewDaemonCredentialStatus,
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

export const guidedReviewDaemonCredentialsApi = {
  getStatus: (): Promise<GuidedReviewDaemonCredentialStatus> =>
    window.electronAPI.credentials.guidedReviewDaemon.getStatus(),

  setToken: (token: string): Promise<GuidedReviewDaemonCredentialStatus> =>
    window.electronAPI.credentials.guidedReviewDaemon.setToken(token),

  deleteToken: (): Promise<GuidedReviewDaemonCredentialStatus> =>
    window.electronAPI.credentials.guidedReviewDaemon.deleteToken(),
}
