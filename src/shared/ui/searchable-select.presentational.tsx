import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk'
import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button, type ButtonProps } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export interface SearchableSelectItem {
  id: string
  label: string
  description?: string
  badge?: {
    label: string
    title?: string
  }
}

export interface SearchableSelectAction {
  label: string
  icon?: ReactNode
  onSelect: () => void
}

export interface SearchableSelectProps {
  selectedId: string | null
  value: string
  items: SearchableSelectItem[]
  onChange: (id: string) => void
  disabled?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
  triggerClassName?: string
  contentClassName?: string
  icon?: ReactNode
  action?: SearchableSelectAction
}

interface SearchableSelectPresentationalProps {
  selectedId: string | null
  value: string
  items: SearchableSelectItem[]
  query: string
  open: boolean
  isDisabled: boolean
  searchPlaceholder: string
  emptyMessage: string
  triggerVariant: ButtonProps['variant']
  triggerSize: ButtonProps['size']
  triggerClassName?: string
  contentClassName?: string
  icon?: ReactNode
  action?: SearchableSelectAction
  selectedBadge?: SearchableSelectItem['badge']
  inputRef: RefObject<HTMLInputElement | null>
  onOpenChange: (open: boolean) => void
  onQueryChange: (query: string) => void
  onSelect: (id: string) => void
  onActionSelect: () => void
}

export function SearchableSelectPresentational({
  selectedId,
  value,
  items,
  query,
  open,
  isDisabled,
  searchPlaceholder,
  emptyMessage,
  triggerVariant,
  triggerSize,
  triggerClassName,
  contentClassName,
  icon,
  action,
  selectedBadge,
  inputRef,
  onOpenChange,
  onQueryChange,
  onSelect,
  onActionSelect,
}: SearchableSelectPresentationalProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          disabled={isDisabled}
          role="combobox"
          aria-label={value}
          aria-expanded={open}
          className={cn('justify-between', triggerClassName)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon}
            <span className="truncate">{value}</span>
            {selectedBadge ? (
              <span
                title={selectedBadge.title}
                className="shrink-0 rounded border border-amber-400/35 bg-amber-500/12 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none text-amber-700 dark:text-amber-200"
              >
                {selectedBadge.label}
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className={cn(
          'flex min-h-0 flex-col min-w-52 w-[var(--radix-popover-trigger-width)] max-w-[min(24rem,calc(100vw-2rem))] max-h-[min(24rem,var(--radix-popover-content-available-height))] p-0',
          contentClassName,
        )}
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <Command
          shouldFilter={false}
          label={searchPlaceholder}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b border-white/10 px-3 py-2">
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={onQueryChange}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList
            className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-1"
            style={{ maxHeight: '100%' }}
            onWheel={(event) => {
              event.currentTarget.scrollTop += event.deltaY
            }}
          >
            {items.length === 0 ? (
              <CommandEmpty className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </CommandEmpty>
            ) : (
              items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => onSelect(item.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{item.label}</span>
                      {item.badge ? (
                        <span
                          title={item.badge.title}
                          className="shrink-0 rounded border border-amber-400/35 bg-amber-500/12 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none text-amber-700 dark:text-amber-200"
                        >
                          {item.badge.label}
                        </span>
                      ) : null}
                    </span>
                    {item.description ? (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </div>
                  {item.id === selectedId ? (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  ) : null}
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
        {action ? (
          <div className="border-t border-white/10 p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-start px-2 py-2 text-sm"
              onClick={onActionSelect}
            >
              {action.icon}
              {action.label}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
