import type { FC } from 'react'
import { Combobox, type ComboboxItem } from '@convergence/ui'
import {
  getProviderLifecycleBadge,
  type ProviderInfo,
  type ResolvedProviderSelection,
} from '@/entities/session'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'

interface SessionStartSelectProps {
  selectedId: string
  value: string
  items: ComboboxItem[]
  onChange: (id: string) => void
}

/**
 * The providers as a picker's items (CONV-17): the icon, the vendor's name,
 * the product's under it when they differ, and the lifecycle badge. One
 * mapping for every provider picker, so they can't drift apart.
 */
export function providerSelectItems(providers: ProviderInfo[]): ComboboxItem[] {
  return providers.map((provider) => ({
    id: provider.id,
    icon: (
      <ProviderIcon
        providerId={provider.id}
        vendorLabel={provider.vendorLabel}
        name={provider.name}
      />
    ),
    label: provider.vendorLabel || provider.name,
    description:
      provider.vendorLabel && provider.vendorLabel !== provider.name
        ? provider.name
        : undefined,
    badge: getProviderLifecycleBadge(provider) ?? undefined,
  }))
}

/** The selected model's efforts as a picker's items (CONV-17). */
export function effortSelectItems(
  selection: ResolvedProviderSelection,
): ComboboxItem[] {
  return (
    selection.model?.effortOptions.map((effort) => ({
      id: effort.id,
      label: effort.label,
      description: effort.description,
    })) ?? []
  )
}

export const SessionStartSelect: FC<SessionStartSelectProps> = ({
  selectedId,
  value,
  items,
  onChange,
}) => (
  <Combobox
    selectedId={selectedId}
    value={value}
    items={items}
    onChange={onChange}
    searchPlaceholder="Search options..."
    emptyMessage="No matching options."
    variant="secondary"
    className="px-2 text-xs"
  />
)
