import type { FC, ReactNode } from 'react'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'

interface ComposerSelectProps {
  selectedId: string
  value: string
  items: SearchableSelectItem[]
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
  icon?: ReactNode
}

export const ComposerSelect: FC<ComposerSelectProps> = ({
  selectedId,
  value,
  items,
  onChange,
  disabled = false,
  className,
  icon,
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
    icon={icon}
  />
)
