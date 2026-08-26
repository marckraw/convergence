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

/**
 * The daemon token of one named Endpoint (MAR-2629). `endpointId` is required
 * at every call rather than defaulted: a caller that has not decided which
 * machine it means must say so, because the alternative is a token stored
 * against — or read from — a daemon nobody chose.
 */
export const executionHostDaemonCredentialsApi = {
  getStatus: (
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> =>
    window.electronAPI.credentials.executionHostDaemon.getStatus(endpointId),

  setToken: (
    endpointId: string,
    token: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> =>
    window.electronAPI.credentials.executionHostDaemon.setToken(
      endpointId,
      token,
    ),

  deleteToken: (
    endpointId: string,
  ): Promise<ExecutionHostDaemonCredentialStatus> =>
    window.electronAPI.credentials.executionHostDaemon.deleteToken(endpointId),
}

export const executionHostApi = {
  testRemoteConnection: (
    endpointId: string,
  ): Promise<RemoteExecutionHostConnectionResult> =>
    window.electronAPI.executionHost.testRemoteConnection(endpointId),

  /**
   * How many sessions name each execution host id. Read by Settings so a
   * removal can say what it costs instead of looking free (MAR-2642).
   */
  sessionCountsByEndpoint: (): Promise<Record<string, number>> =>
    window.electronAPI.executionHost.sessionCountsByEndpoint(),

  getSessionWorkspace: (
    sessionId: string,
  ): Promise<RemoteSessionWorkspaceResult> =>
    window.electronAPI.executionHost.getSessionWorkspace(sessionId),
}
