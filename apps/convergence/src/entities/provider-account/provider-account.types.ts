import type { ClaudeAccountLayout } from '@/shared/types/provider-account-layout.types'
export type { ClaudeAccountLayout } from '@/shared/types/provider-account-layout.types'
export type ProviderAccountStatus = 'connected' | 'expired' | 'unavailable'

export type ProviderAccountEnrollmentProvider = 'claude-code' | 'codex'

export interface ProviderAccount {
  id: string
  providerId: string
  label: string
  authKind: 'subscription-oauth' | 'setup-token'
  email: string | null
  orgId: string | null
  plan: string | null
  configDir: string
  credentialDir: string
  executionHostId: string
  isDefault: boolean
  status: ProviderAccountStatus
  lastValidatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProviderAccountSettingsWarning {
  kind: 'api-key-helper' | 'credential-env-key' | 'native-history-layout'
  key: string
  message: string
}

export interface ProviderAccountEnrolResult {
  account: ProviderAccount
  warnings: ProviderAccountSettingsWarning[]
}

export type ProviderAccountAttestationOutcome =
  | 'verified'
  | 'identity-mismatch'
  | 'identity-unknown'
  | 'unreadable'

export interface ProviderAccountAttestationResult {
  accountId: string
  label: string
  email: string | null
  outcome: ProviderAccountAttestationOutcome
  identityOutcome?: ProviderAccountAttestationOutcome
  credentialHealth?: 'present' | 'absent' | 'unknown'
  status: ProviderAccountStatus
  detail: string | null
  unknownEntries: string[]
  missingLinks: string[]
  nativeHistoryWarnings?: string[]
  claudeHistory?: ClaudeAccountLayout
}

export interface ProviderAccountHealth {
  checkedAt: string | null
  claudeVersion: string | null
  accounts: ProviderAccountAttestationResult[]
  settingsWarnings: ProviderAccountSettingsWarning[]
}

/**
 * One MCP server as *this account* sees it (ADR 0007, PA11). Tokens are
 * namespaced per credential slot, so the same server can be authorized under
 * one account and not another.
 */
export interface ProviderAccountConnector {
  name: string
  status: string
  statusLabel: string
  description: string
  needsAuthorization: boolean
}

export interface ProviderAccountConnectors {
  providerAccountId: string | null
  connectors: ProviderAccountConnector[]
  error: string | null
}
