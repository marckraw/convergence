import type { FC } from 'react'
import { Star } from 'lucide-react'
import { Badge, Button, cn, Tooltip } from '@convergence/ui'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import type { ModelPickerProviderFilter } from './model-picker-dialog.types'

interface ProviderFilterButtonProps {
  id: string
  label: string
  count: number
  selected: boolean
  provider?: ModelPickerProviderFilter
  onSelect: (id: string) => void
}

/** The All and Favorites marks, in the favourites' hue (R1: tag-yellow). */
const favoriteMark =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-tag-yellow/30 bg-tag-yellow/10 text-tag-yellow-ink'

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
    aria-pressed={selected}
    onClick={() => onSelect(id)}
    size="lg"
    className={cn(
      'shrink-0 justify-start px-2 text-left text-xs sm:w-full py-0',
      // R7: the chosen look is the selected fill; hover is half of it.
      selected
        ? 'bg-fill-selected text-on-highlight'
        : 'text-ink-muted hover:bg-fill-hover hover:text-ink',
    )}
  >
    {provider ? (
      provider.kind === 'favorites' ? (
        <span aria-hidden="true" className={favoriteMark}>
          <Star className="size-3.5 fill-current" />
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
        className={cn(favoriteMark, 'text-3xs leading-none font-semibold')}
      >
        *
      </span>
    )}
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="min-w-0 truncate">{label}</span>
      {provider?.badge ? (
        <Tooltip label={provider.badge.title}>
          <Badge
            tone="warning"
            shape="label"
            className="shrink-0 uppercase leading-none font-semibold"
          >
            {provider.badge.label}
          </Badge>
        </Tooltip>
      ) : null}
    </span>
    <Badge shape="count">{count}</Badge>
  </Button>
)
