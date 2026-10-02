import type { FC, ReactNode } from 'react'
import { Combobox, type ComboboxItem, type ControlSize } from '@convergence/ui'

interface ComposerComboboxProps {
  /**
   * What it picks, as its name: "Permissions", "Speed", "Runs on" (CONV N2).
   * Required, so no picker is announced by its value alone ("Ask, combobox")
   * while the value is what it shows.
   */
  label: string
  selectedId: string
  value: string
  items: ComboboxItem[]
  onChange: (id: string) => void
  disabled?: boolean
  /** R3: the row's one size, as a prop (CONV-14). `md` unless said. */
  size?: ControlSize
  className?: string
  icon?: ReactNode
}

/**
 * One of the composer's searchable choices, a ghost Combobox in the toolbar:
 * the speed, the permissions and their advanced settings, and the strip's
 * machine. The provider and the effort are a few fixed choices, so they are
 * ComposerSelect (R9, ruling 12).
 */
export const ComposerCombobox: FC<ComposerComboboxProps> = ({
  label,
  selectedId,
  value,
  items,
  onChange,
  disabled = false,
  size = 'md',
  className,
  icon,
}) => (
  <Combobox
    selectedId={selectedId}
    value={value}
    items={items}
    onChange={onChange}
    disabled={disabled}
    searchPlaceholder="Search options…"
    emptyMessage="No matching options."
    variant="ghost"
    size={size}
    className={className}
    icon={icon}
    ariaLabel={label}
  />
)
