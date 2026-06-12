import type {
  AppSettings,
  AppSettingsInput,
  ExecutionHostDaemonCredentialStatus,
  GuidedReviewDaemonCredentialStatus,
  OpenRouterCredentialStatus,
  RemoteExecutionHostConnectionResult,
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

export const executionHostDaemonCredentialsApi = {
  getStatus: (): Promise<ExecutionHostDaemonCredentialStatus> =>
    window.electronAPI.credentials.executionHostDaemon.getStatus(),

  setToken: (token: string): Promise<ExecutionHostDaemonCredentialStatus> =>
    window.electronAPI.credentials.executionHostDaemon.setToken(token),

  deleteToken: (): Promise<ExecutionHostDaemonCredentialStatus> =>
    window.electronAPI.credentials.executionHostDaemon.deleteToken(),
}

export const executionHostApi = {
  testRemoteConnection: (): Promise<RemoteExecutionHostConnectionResult> =>
    window.electronAPI.executionHost.testRemoteConnection(),
}
