import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

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
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length === 0}
        className="justify-between px-2 text-xs"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="h-3 w-3" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-52">
      {items.map((item) => (
        <DropdownMenuItem
          key={item.id}
          onClick={() => onChange(item.id)}
          className="gap-2"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium">{item.label}</span>
            {item.description && (
              <span className="truncate text-[11px] text-muted-foreground">
                {item.description}
              </span>
            )}
          </div>
          {item.id === selectedId && <Check className="ml-auto h-3.5 w-3.5" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
)
