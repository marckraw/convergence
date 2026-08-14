import { useRef, useState } from 'react'
import type { FC } from 'react'
import { Command, CommandEmpty, CommandInput, CommandList } from 'cmdk'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import {
  filterFacetOptions,
  formatFacetSummary,
} from './session-card-facets.pure'
import type { SessionCardFacetOption } from './session-card-facets.pure'

interface SessionFacetPickerProps {
  label: string
  allLabel: string
  noun: string
  searchPlaceholder: string
  options: readonly SessionCardFacetOption[]
  selected: readonly string[]
  onToggle: (id: string) => void
  onClear: () => void
}

/**
 * A multi-select picker for one filter dimension. Selecting nothing means
 * everything, so the trigger reads "All projects" until Marcin narrows it.
 *
 * Search and scroll are not decoration: the project list is as long as the
 * number of repositories he works in, and a menu that runs off the screen is
 * not a control.
 */
export const SessionFacetPicker: FC<SessionFacetPickerProps> = ({
  label,
  allLabel,
  noun,
  searchPlaceholder,
  options,
  selected,
  onToggle,
  onClear,
}) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const summary = formatFacetSummary(selected, options, allLabel, noun)
  const visible = filterFacetOptions(options, query)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={options.length === 0}
          className={cn(
            'h-7 max-w-56 gap-1.5 rounded-full border px-2.5 text-[11px] font-normal',
            selected.length > 0
              ? 'border-white/25 bg-white/10 text-foreground'
              : 'border-white/10 text-muted-foreground hover:border-white/20',
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={16}
        className="flex max-h-[min(20rem,var(--radix-popover-content-available-height))] w-64 min-w-52 flex-col p-0"
        onOpenAutoFocus={(event) => {
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
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>

          <CommandList
            className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-1"
            style={{ maxHeight: '100%' }}
            onWheel={(event) => {
              event.currentTarget.scrollTop += event.deltaY
            }}
          >
            {visible.length === 0 ? (
              <CommandEmpty className="px-2 py-6 text-center text-xs text-muted-foreground">
                Nothing matches “{query}”
              </CommandEmpty>
            ) : (
              visible.map((option) => {
                const active = selected.includes(option.id)

                return (
                  // Multi-select: picking keeps the menu open so several
                  // projects can be chosen in one pass.
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onToggle(option.id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  >
                    <Check
                      className={cn(
                        'size-3.5 shrink-0',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {option.count}
                    </span>
                  </button>
                )
              })
            )}
          </CommandList>
        </Command>

        {selected.length > 0 ? (
          <div className="shrink-0 border-t border-white/10 p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start px-2 text-xs font-normal"
              onClick={() => onClear()}
            >
              {allLabel}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
