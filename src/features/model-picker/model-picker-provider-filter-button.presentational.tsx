import type { FC } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon.pure'
import type { ModelPickerProviderFilter } from './model-picker-dialog.types'

interface ProviderFilterButtonProps {
  id: string
  label: string
  count: number
  selected: boolean
  provider?: ModelPickerProviderFilter
  onSelect: (id: string) => void
}

export const ModelPickerProviderFilterButton: FC<ProviderFilterButtonProps> = ({
  id,
  label,
  count,
  selected,
  provider,
  onSelect,
}) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    aria-pressed={selected}
    className={cn(
      'h-9 shrink-0 justify-start gap-2 px-2 text-left text-xs sm:w-full',
      selected
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
    )}
    onClick={() => onSelect(id)}
  >
    {provider ? (
      provider.kind === 'favorites' ? (
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-yellow-400/30 bg-yellow-500/12 text-yellow-700 dark:text-yellow-200"
        >
          <Star className="h-3.5 w-3.5 fill-current" />
        </span>
      ) : (
        <ProviderIcon
          providerId={provider.id}
          vendorLabel={provider.vendorLabel}
          name={provider.name}
        />
      )
    ) : (
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-yellow-400/30 bg-yellow-500/12 text-[10px] font-semibold leading-none text-yellow-700 dark:text-yellow-200"
      >
        *
      </span>
    )}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {count}
    </span>
  </Button>
)
