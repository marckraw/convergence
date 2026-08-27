import type {
  RemoteSessionWorkspaceResult,
  AppSettings,
  AppSettingsInput,
  ExecutionHostDaemonCredentialStatus,
  ExecutionHostDaemonEnvironmentOverride,
  ExecutionHostSessionCount,
  OpenRouterCredentialStatus,
  RemoteExecutionHostConnectionResult,
} from './app-settings.types'

export const appSettingsApi = {
  get: (): Promise<AppSettings> => window.electronAPI.appSettings.get(),

  set: (input: AppSettingsInput): Promise<AppSettings> =>
    window.electronAPI.appSettings.set(input),

  /**
   * Destroys stored daemon credentials whose Endpoint no longer exists, and
   * answers with the accounts it emptied (MAR-2642).
   *
   * A removal commits the settings before it destroys the token, so a Keychain
   * that refused the cleanup — or a quit between the two — leaves an entry
   * filed under an id no Endpoint will ever bear again. The sweep is
   * idempotent, so the surface where removals are made can simply ask for it
   * again each time it opens rather than waiting for a restart.
   */
  sweepExecutionHostCredentials: (): Promise<string[]> =>
    window.electronAPI.appSettings.sweepExecutionHostCredentials(),

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

  /**
   * The one daemon credential that names no Endpoint, so it is asked about
   * without one (MAR-2642). No sweep can reach it and no row records it, so a
   * surface that never asked would leave a dead credential invisible.
   */
  environmentOverride: (): Promise<ExecutionHostDaemonEnvironmentOverride> =>
    window.electronAPI.credentials.executionHostDaemon.environmentOverride(),
}

export const executionHostApi = {
  testRemoteConnection: (
    endpointId: string,
  ): Promise<RemoteExecutionHostConnectionResult> =>
    window.electronAPI.executionHost.testRemoteConnection(endpointId),

  /**
   * How many sessions name each execution host. Read by Settings so a removal
   * can say what it costs instead of looking free (MAR-2642).
   */
  sessionCountsByEndpoint: (): Promise<ExecutionHostSessionCount[]> =>
    window.electronAPI.executionHost.sessionCountsByEndpoint(),

  getSessionWorkspace: (
    sessionId: string,
  ): Promise<RemoteSessionWorkspaceResult> =>
    window.electronAPI.executionHost.getSessionWorkspace(sessionId),
}
