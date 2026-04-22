import type { FC } from 'react'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'

interface SessionStartSelectProps {
  selectedId: string
  value: string
  items: Array<{
    id: string
    label: string
    description?: string
  }>
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
    triggerVariant="outline"
    triggerSize="sm"
    triggerClassName="px-2 text-xs"
  />
)
