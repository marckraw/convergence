import type { FC } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { formatFacetSummary } from './session-card-facets.pure'
import type { SessionCardFacetOption } from './session-card-facets.pure'

interface SessionFacetPickerProps {
  label: string
  allLabel: string
  noun: string
  options: readonly SessionCardFacetOption[]
  selected: readonly string[]
  onToggle: (id: string) => void
  onClear: () => void
}

/**
 * A multi-select picker for one filter dimension. Selecting nothing means
 * everything, so the trigger reads "All projects" until Marcin narrows it.
 */
export const SessionFacetPicker: FC<SessionFacetPickerProps> = ({
  label,
  allLabel,
  noun,
  options,
  selected,
  onToggle,
  onClear,
}) => {
  const summary = formatFacetSummary(selected, options, allLabel, noun)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label}
          disabled={options.length === 0}
          className={cn(
            'h-7 gap-1.5 rounded-full border px-2.5 text-[11px] font-normal',
            selected.length > 0
              ? 'border-white/25 bg-white/10 text-foreground'
              : 'border-white/10 text-muted-foreground hover:border-white/20',
          )}
        >
          {summary}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-48">
        {options.map((option) => {
          const active = selected.includes(option.id)

          return (
            <DropdownMenuItem
              key={option.id}
              onSelect={(event) => {
                // Keep the menu open — picking is a multi-select.
                event.preventDefault()
                onToggle(option.id)
              }}
              className="gap-2 text-xs"
            >
              <Check
                className={cn('size-3.5', active ? 'opacity-100' : 'opacity-0')}
              />
              <span className="flex-1 truncate">{option.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {option.count}
              </span>
            </DropdownMenuItem>
          )
        })}

        {selected.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onClear()} className="text-xs">
              {allLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
