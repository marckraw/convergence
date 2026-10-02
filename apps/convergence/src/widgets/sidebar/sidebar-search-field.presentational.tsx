import type { FC, RefObject } from 'react'
import { cn, SearchField } from '@convergence/ui'

interface SidebarSearchFieldProps {
  query: string
  inputRef: RefObject<HTMLInputElement | null>
  onQueryChange: (value: string) => void
  onClear: () => void
  onEscape: () => void
  className?: string
}

/**
 * The sidebar's conversation search: the kit's SearchField (NAV-15), with
 * its magnifier and one clear button (the browser's own is hidden), in the
 * search landmark the ⌘F shortcut looks for.
 */
export const SidebarSearchField: FC<SidebarSearchFieldProps> = ({
  query,
  inputRef,
  onQueryChange,
  onClear,
  onEscape,
  className,
}) => (
  <div
    data-sidebar-search
    role="search"
    aria-label="Search conversations"
    className={cn('px-3 pt-2', className)}
  >
    <SearchField
      size="md"
      ref={inputRef}
      value={query}
      placeholder="Search conversations"
      aria-label="Search conversations"
      onChange={(event) => onQueryChange(event.target.value)}
      onClear={onClear}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onEscape()
      }}
    />
  </div>
)
