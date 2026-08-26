import type {
  RemoteSessionWorkspaceResult,
  AppSettings,
  AppSettingsInput,
  ExecutionHostDaemonCredentialStatus,
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

  getSessionWorkspace: (
    sessionId: string,
  ): Promise<RemoteSessionWorkspaceResult> =>
    window.electronAPI.executionHost.getSessionWorkspace(sessionId),
}
