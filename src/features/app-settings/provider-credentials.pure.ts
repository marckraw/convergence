import type {
  CursorCredentialStatus,
  OpenRouterCredentialStatus,
} from '@/entities/app-settings'

export type ProviderCredentialStatus =
  | OpenRouterCredentialStatus
  | CursorCredentialStatus

export function formatProviderCredentialStatus(
  status: ProviderCredentialStatus | null,
): string {
  if (!status) return 'Checking...'
  if (status.error) return status.error
  if (!status.configured) return 'Not configured'
  if (status.source === 'environment') return 'Configured from environment'
  if (status.source === 'keychain') return 'Configured in Keychain, key hidden'
  return 'Configured'
}
