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
  /**
   * Why no account can be picked at all, if that is the case (PA10). Rendered
   * instead of the picker: a control that silently did nothing would be worse
   * than one that says why.
   */
  unavailableReason?: string | null
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
  unavailableReason = null,
}) => {
  if (accounts.length === 0) return null

  if (unavailableReason) {
    return (
      <span
        title={unavailableReason}
        aria-label={unavailableReason}
        className="flex shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground opacity-60"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Default account · local only
      </span>
    )
  }

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
