import type { FC } from 'react'
import { Star } from 'lucide-react'
import { Badge, cn, ListRow, Tooltip } from '@convergence/ui'
import { ProviderIcon } from '@/entities/provider'
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

/**
 * One provider in the model picker's rail (DLG-8): a row of a list, and the
 * chosen one is a selected row, its fill and aria-current (R7), never a look
 * typed onto a Button. Side by side on a narrow window, stacked beside the
 * models on a wide one.
 */
export const ModelPickerProviderFilterButton: FC<ProviderFilterButtonProps> = ({
  id,
  label,
  count,
  selected,
  provider,
  onSelect,
}) => (
  <ListRow
    density="dense"
    selected={selected}
    render={<button type="button" />}
    onClick={() => onSelect(id)}
    className="w-auto shrink-0 sm:w-full"
    leading={
      provider ? (
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
      )
    }
    title={label}
    marks={
      provider?.badge ? (
        <Tooltip label={provider.badge.title}>
          <Badge
            tone="warning"
            shape="label"
            caps
            className="shrink-0 leading-none font-semibold"
          >
            {provider.badge.label}
          </Badge>
        </Tooltip>
      ) : undefined
    }
    trailing={<Badge shape="count">{count}</Badge>}
  />
)
