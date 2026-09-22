import type { FC, RefObject } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn.pure'

interface SidebarSearchFieldProps {
  query: string
  inputRef: RefObject<HTMLInputElement | null>
  onQueryChange: (value: string) => void
  onClear: () => void
  onEscape: () => void
  className?: string
}

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
    className={cn('relative px-3 pt-2', className)}
  >
    <Input
      ref={inputRef}
      type="search"
      value={query}
      placeholder="Search conversations"
      aria-label="Search conversations"
      className="h-8 pr-8"
      onChange={(event) => onQueryChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onEscape()
      }}
    />
    {query.length > 0 ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-2.5 right-3.5 h-7 w-7 text-muted-foreground"
        aria-label="Clear search"
        onClick={onClear}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    ) : null}
  </div>
)
