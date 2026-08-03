export type ProviderAccountStatus = 'connected' | 'expired' | 'unavailable'

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
  kind: 'api-key-helper' | 'credential-env-key'
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
  status: ProviderAccountStatus
  detail: string | null
  unknownEntries: string[]
  missingLinks: string[]
}

export interface ProviderAccountHealth {
  checkedAt: string | null
  claudeVersion: string | null
  accounts: ProviderAccountAttestationResult[]
  settingsWarnings: ProviderAccountSettingsWarning[]
}
