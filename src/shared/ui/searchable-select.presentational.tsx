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
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className={cn(
          'min-w-52 w-[var(--radix-popover-trigger-width)] max-w-[min(24rem,calc(100vw-2rem))] p-0',
          contentClassName,
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <Command
          shouldFilter={false}
          label={searchPlaceholder}
          className="flex min-h-0 flex-col"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={onQueryChange}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="app-scrollbar max-h-72 overflow-y-auto p-1">
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
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-white/10"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{item.label}</span>
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
