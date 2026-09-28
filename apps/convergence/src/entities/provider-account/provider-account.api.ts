import type { ProviderAccountLoginAttempt } from '@/shared/types/provider-account-login.types'
import type {
  ClaudeAccountLayout,
  ProviderAccount,
  ProviderAccountConnectors,
  ProviderAccountChatGptApps,
  ProviderAccountChatGptSignIns,
  ProviderAccountEnrolResult,
  ProviderAccountEnrollmentProvider,
  ProviderAccountHealth,
  ProviderAccountSettingsWarning,
} from './provider-account.types'

/**
 * Provider accounts (ADR 0007). PA3 shipped the backend and this thin boundary;
 * PA6 gives it a settings surface, so every call here is now reachable by a
 * person rather than only from the developer console.
 */
export const providerAccountApi = {
  loginAttempt: (): Promise<ProviderAccountLoginAttempt | null> =>
    window.electronAPI.providerAccounts.loginAttempt(),
  cancelLogin: (id: string): Promise<ProviderAccountLoginAttempt | null> =>
    window.electronAPI.providerAccounts.cancelLogin(id),
  submitLoginCode: (id: string, code: string): Promise<void> =>
    window.electronAPI.providerAccounts.submitLoginCode(id, code),
  onLoginChanged: (
    callback: (attempt: ProviderAccountLoginAttempt) => void,
  ): (() => void) =>
    window.electronAPI.providerAccounts.onLoginChanged(callback),
  list: (): Promise<ProviderAccount[]> =>
    window.electronAPI.providerAccounts.list(),
  enrol: (input: {
    email: string
    label?: string | null
    providerId?: ProviderAccountEnrollmentProvider
  }): Promise<ProviderAccountEnrolResult> =>
    window.electronAPI.providerAccounts.enrol(input),
  reconnect: (accountId: string): Promise<ProviderAccount> =>
    window.electronAPI.providerAccounts.reconnect(accountId),
  remove: (
    accountId: string,
    options?: { deletePrivateHistory?: boolean },
  ): Promise<void> =>
    options
      ? window.electronAPI.providerAccounts.remove(accountId, options)
      : window.electronAPI.providerAccounts.remove(accountId),
  inspectHistory: (accountId: string): Promise<ClaudeAccountLayout | null> =>
    window.electronAPI.providerAccounts.inspectHistory(accountId),
  setDefault: (accountId: string): Promise<ProviderAccount[]> =>
    window.electronAPI.providerAccounts.setDefault(accountId),
  rename: (accountId: string, label: string): Promise<ProviderAccount[]> =>
    window.electronAPI.providerAccounts.rename(accountId, label),
  sweepOrphans: (): Promise<string[]> =>
    window.electronAPI.providerAccounts.sweepOrphans(),
  scanSharedSettings: (): Promise<ProviderAccountSettingsWarning[]> =>
    window.electronAPI.providerAccounts.scanSharedSettings(),
  attest: (): Promise<ProviderAccountHealth> =>
    window.electronAPI.providerAccounts.attest(),
  health: (): Promise<ProviderAccountHealth> =>
    window.electronAPI.providerAccounts.health(),
  /**
   * What this account can reach. Answered by running the provider's own
   * `mcp list` as the account, because the ambient answer is a different
   * account's answer (PA11).
   */
  listChatGptApps: (input: {
    accountId: string
    forceRefetch?: boolean
  }): Promise<ProviderAccountChatGptApps> =>
    window.electronAPI.providerAccounts.listChatGptApps(input),
  /** Uses each installed app once, read-only, to see if its sign-in works. */
  checkChatGptAppSignIns: (input: {
    accountId: string
  }): Promise<ProviderAccountChatGptSignIns> =>
    window.electronAPI.providerAccounts.checkChatGptAppSignIns(input),
  manageChatGptApp: (input: {
    accountId: string
    appId: string
  }): Promise<void> =>
    window.electronAPI.providerAccounts.manageChatGptApp(input),
  browseChatGptApps: (): Promise<void> =>
    window.electronAPI.providerAccounts.browseChatGptApps(),
  /** Copies the link a ChatGPT button would open, for another browser profile. */
  copyChatGptLink: (input: {
    accountId: string
    appId?: string | null
  }): Promise<void> =>
    window.electronAPI.providerAccounts.copyChatGptLink(input),
  /**
   * The account a session's next automatic turn (a relay hop, a dispatch)
   * runs on, resolved by the rule those use; null is the ambient default.
   */
  automaticTurnAccount: (sessionId: string): Promise<string | null> =>
    window.electronAPI.providerAccounts.automaticTurnAccount(sessionId),
  listConnectors: (
    accountId: string | null,
  ): Promise<ProviderAccountConnectors> =>
    window.electronAPI.providerAccounts.listConnectors(accountId),
  connectLinear: (accountId: string): Promise<ProviderAccountConnectors> =>
    window.electronAPI.providerAccounts.connectLinear(accountId),
  authorizeConnector: (input: {
    accountId: string | null
    serverName: string
  }): Promise<ProviderAccountConnectors> =>
    window.electronAPI.providerAccounts.authorizeConnector(input),
}
