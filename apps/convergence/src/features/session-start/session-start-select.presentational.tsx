import type { FC } from 'react'
import { SearchableSelect, type SearchableSelectItem } from '@convergence/ui'

interface SessionStartSelectProps {
  selectedId: string
  value: string
  items: SearchableSelectItem[]
  onChange: (id: string) => void
}

export const SessionStartSelect: FC<SessionStartSelectProps> = ({
  selectedId,
  value,
  items,
  onChange,
}) => (
  <SearchableSelect
    selectedId={selectedId}
    value={value}
    items={items}
    onChange={onChange}
    searchPlaceholder="Search options..."
    emptyMessage="No matching options."
    triggerVariant="secondary"
    triggerSize="md"
    triggerClassName="px-2 text-xs"
  />
)
