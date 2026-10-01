import type { FC } from 'react'
import { Combobox, type ComboboxItem } from '@convergence/ui'

interface SessionStartSelectProps {
  selectedId: string
  value: string
  items: ComboboxItem[]
  onChange: (id: string) => void
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
