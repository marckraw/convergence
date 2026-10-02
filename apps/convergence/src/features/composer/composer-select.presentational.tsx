import type { FC, ReactNode } from 'react'
import { Combobox, type ComboboxItem, type ControlSize } from '@convergence/ui'

interface ComposerSelectProps {
  selectedId: string
  value: string
  items: ComboboxItem[]
  onChange: (id: string) => void
  disabled?: boolean
  /** R3: the row's one size, as a prop (CONV-14). `md` unless said. */
  size?: ControlSize
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
  size = 'md',
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
    size={size}
    className={className}
    icon={icon}
    ariaLabel={ariaLabel}
  />
)
