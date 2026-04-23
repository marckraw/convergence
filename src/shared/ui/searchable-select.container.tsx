import { useMemo, useRef, useState } from 'react'
import {
  SearchableSelectPresentational,
  type SearchableSelectProps,
} from './searchable-select.presentational'

export function SearchableSelect({
  selectedId,
  value,
  items,
  onChange,
  disabled = false,
  searchPlaceholder = 'Search options...',
  emptyMessage = 'No options found.',
  triggerVariant = 'outline',
  triggerSize = 'sm',
  triggerClassName,
  contentClassName,
  icon,
  action,
  popoverContainer,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const isDisabled = disabled || (items.length === 0 && !action)

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return items
    }

    return items.filter((item) =>
      [item.label, item.description]
        .filter(Boolean)
        .some((entry) => entry!.toLowerCase().includes(normalizedQuery)),
    )
  }, [items, normalizedQuery])

  const reset = () => {
    setOpen(false)
    setQuery('')
  }

  return (
    <SearchableSelectPresentational
      selectedId={selectedId}
      value={value}
      items={filteredItems}
      query={query}
      open={open}
      isDisabled={isDisabled}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
      contentClassName={contentClassName}
      icon={icon}
      action={action}
      popoverContainer={popoverContainer}
      inputRef={inputRef}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery('')
        }
      }}
      onQueryChange={setQuery}
      onSelect={(id) => {
        onChange(id)
        reset()
      }}
      onActionSelect={() => {
        action?.onSelect()
        reset()
      }}
    />
  )
}
