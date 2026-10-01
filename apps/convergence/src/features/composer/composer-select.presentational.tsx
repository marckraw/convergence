import type { FC, ReactNode } from 'react'
import { SearchableSelect, type SearchableSelectItem } from '@convergence/ui'

interface ComposerSelectProps {
  selectedId: string
  value: string
  items: SearchableSelectItem[]
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
  icon?: ReactNode
  ariaLabel?: string
}

export const ComposerSelect: FC<ComposerSelectProps> = ({
  selectedId,
  value,
  items,
  onChange,
  disabled = false,
  className,
  icon,
  ariaLabel,
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
    ariaLabel={ariaLabel}
  />
)
