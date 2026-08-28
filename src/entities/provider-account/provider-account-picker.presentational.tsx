import type { FC } from 'react'
import { KeyRound } from 'lucide-react'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import {
  AMBIENT_DEFAULT_ACCOUNT_ID,
  buildProviderAccountPickerItems,
  describeSelectedProviderAccount,
  providerAccountIdFromPickerValue,
} from './provider-account.pure'
import type { ProviderAccount } from './provider-account.types'

interface ProviderAccountPickerProps {
  accounts: ProviderAccount[]
  /** `null` is the ambient default account, not an absent value. */
  selectedAccountId: string | null
  onChange: (accountId: string | null) => void
  /** Locked while a turn — including its continuations — is still in flight. */
  disabled?: boolean
}

/**
 * Which account serves a turn (ADR 0007, PA5).
 *
 * Lives in the entity rather than in the composer because it is now asked in
 * two places: before a turn a human is about to send, and on a relay that will
 * send one later without them. One picker, so the two can never drift into
 * describing the same accounts differently.
 *
 * Shows identity rather than capacity: accounts belong to different
 * organizations, and organizations differ in model rollouts and defaults, so a
 * swap can change what actually answers. There is deliberately no
 * "switch when low" affordance — selection is manual by policy.
 */
export const ProviderAccountPicker: FC<ProviderAccountPickerProps> = ({
  accounts,
  selectedAccountId,
  onChange,
  disabled = false,
}) => {
  // No accounts, no picker. On a daemon that is not a filtered-empty list but
  // the absence of the concept: accounts are directories on this machine, and
  // the wire protocol carries no account reference (MAR-2682, "the account
  // picker is gone on a remote").
  if (accounts.length === 0) return null

  return (
    <SearchableSelect
      selectedId={selectedAccountId ?? AMBIENT_DEFAULT_ACCOUNT_ID}
      value={describeSelectedProviderAccount(selectedAccountId, accounts)}
      items={buildProviderAccountPickerItems(accounts)}
      onChange={(value) => onChange(providerAccountIdFromPickerValue(value))}
      disabled={disabled}
      icon={<KeyRound className="h-3.5 w-3.5" />}
      searchPlaceholder="Search accounts..."
      emptyMessage="No matching accounts."
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
    />
  )
}
