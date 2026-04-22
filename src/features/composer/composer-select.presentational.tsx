import type { FC } from 'react'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'

interface ComposerSelectProps {
  selectedId: string
  value: string
  items: Array<{
    id: string
    label: string
    description?: string
  }>
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
}

export const ComposerSelect: FC<ComposerSelectProps> = ({
  selectedId,
  value,
  items,
  onChange,
  disabled = false,
  className,
}) => (
  <SearchableSelect
    selectedId={selectedId}
    value={value}
    items={items}
    onChange={onChange}
    disabled={disabled}
    searchPlaceholder="Search options..."
    emptyMessage="No matching options."
    triggerVariant="ghost"
    triggerSize="sm"
    triggerClassName={className}
  />
)
