import type { FC } from 'react'
import { KeyRound } from 'lucide-react'
import {
  AMBIENT_DEFAULT_ACCOUNT_ID,
  buildProviderAccountPickerItems,
  describeSelectedProviderAccount,
  providerAccountIdFromPickerValue,
  type ProviderAccount,
} from '@/entities/provider-account'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'

interface ComposerAccountPickerProps {
  accounts: ProviderAccount[]
  /** `null` is the ambient default account, not an absent value. */
  selectedAccountId: string | null
  onChange: (accountId: string | null) => void
  /** Locked while a turn — including its continuations — is still in flight. */
  disabled?: boolean
}

/**
 * Which Claude account serves the next turn (ADR 0007, PA5).
 *
 * Shows identity rather than capacity: accounts belong to different
 * organizations, and organizations differ in model rollouts and defaults, so a
 * swap can change what actually answers. There is deliberately no
 * "switch when low" affordance — selection is manual by policy.
 */
export const ComposerAccountPicker: FC<ComposerAccountPickerProps> = ({
  accounts,
  selectedAccountId,
  onChange,
  disabled = false,
}) => {
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
