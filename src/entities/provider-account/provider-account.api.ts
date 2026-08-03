import type {
  ProviderAccount,
  ProviderAccountEnrolResult,
  ProviderAccountHealth,
  ProviderAccountSettingsWarning,
} from './provider-account.types'

/**
 * Provider accounts (ADR 0007). PA3 ships the backend and this thin boundary;
 * the enrolment surface itself is PA6, so `enrol` is reachable today only from
 * the developer console.
 */
export const providerAccountApi = {
  list: (): Promise<ProviderAccount[]> =>
    window.electronAPI.providerAccounts.list(),
  enrol: (input: {
    email: string
    label?: string | null
  }): Promise<ProviderAccountEnrolResult> =>
    window.electronAPI.providerAccounts.enrol(input),
  remove: (accountId: string): Promise<void> =>
    window.electronAPI.providerAccounts.remove(accountId),
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
}
