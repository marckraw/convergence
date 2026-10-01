import type { FC, ReactNode } from 'react'
import { Combobox, type ComboboxItem } from '@convergence/ui'

interface ComposerSelectProps {
  selectedId: string
  value: string
  items: ComboboxItem[]
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
  <Combobox
    selectedId={selectedId}
    value={value}
    items={items}
    onChange={onChange}
    disabled={disabled}
    searchPlaceholder="Search options..."
    emptyMessage="No matching options."
    variant="ghost"
    className={className}
    icon={icon}
    ariaLabel={ariaLabel}
  />
)
