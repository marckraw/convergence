import type { FC } from 'react'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'

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
    triggerVariant="outline"
    triggerSize="sm"
    triggerClassName="px-2 text-xs"
  />
)
