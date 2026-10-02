import { useId, type FC, type RefObject } from 'react'
import { Check, ChevronDown, Star } from 'lucide-react'
import {
  Badge,
  Button,
  type ButtonProps,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  dialogRail,
  dialogSplit,
  EmptyState,
  IconButton,
  Listbox,
  ListboxOption,
  listboxOptionId,
  listboxStep,
  SearchField,
  Tooltip,
} from '@convergence/ui'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import type {
  ModelPickerModelItem,
  ModelPickerProviderFilter,
} from './model-picker-dialog.types'
import { ModelPickerProviderFilterButton } from './model-picker-provider-filter-button.presentational'

interface ModelPickerDialogPresentationalProps {
  open: boolean
  query: string
  providerFilterId: string
  selectedValue: string | undefined
  value: string
  /** The field it picks for: the trigger's name, the value its description. */
  label?: string
  providers: ModelPickerProviderFilter[]
  models: ModelPickerModelItem[]
  totalModelCount: number
  isDisabled: boolean
  triggerVariant: ButtonProps['variant']
  triggerSize: ButtonProps['size']
  triggerClassName?: string
  inputRef: RefObject<HTMLInputElement | null>
  onOpenChange: (open: boolean) => void
  onQueryChange: (query: string) => void
  onProviderFilterChange: (providerId: string) => void
  onSelectedValueChange: (value: string) => void
  onSelect: (item: ModelPickerModelItem) => void
  onToggleFavorite: (item: ModelPickerModelItem) => void
}

/** A favourite's star, in its category hue (R1: favourites are tag-yellow). */
const favoriteInk = 'text-tag-yellow-ink hover:text-tag-yellow-ink'

function formatContextWindowTokens(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) {
    return `${value / 1_000_000}m context`
  }
  if (value >= 1_000 && value % 1_000 === 0) {
    return `${value / 1_000}k context`
  }
  return `${new Intl.NumberFormat('en-US').format(value)} context`
}

/**
 * The model picker (MAR-3616 DS3e): a Dialog holding a SearchField, the
 * provider filters and the Listbox the field drives. The field keeps the
 * focus; the arrows (and Home, End, Control-N and -P) move the active row,
 * which the container keeps (`selectedValue`), Enter picks it, and Escape
 * closes the dialog. Nothing matching shows an EmptyState, not an empty list.
 */
export const ModelPickerDialogPresentational: FC<
  ModelPickerDialogPresentationalProps
> = ({
  open,
  query,
  providerFilterId,
  selectedValue,
  value,
  label,
  providers,
  models,
  totalModelCount,
  isDisabled,
  triggerVariant,
  triggerSize,
  triggerClassName,
  inputRef,
  onOpenChange,
  onQueryChange,
  onProviderFilterChange,
  onSelectedValueChange,
  onSelect,
  onToggleFavorite,
}) => {
  const listId = useId()
  const valueId = useId()
  const selectedIndex = models.findIndex((item) => item.value === selectedValue)
  const active = models.length === 0 ? null : Math.max(selectedIndex, 0)
  const hasModels = models.length > 0
  const activeModel = active === null ? null : models[active]

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        disabled={isDisabled}
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ?? value}
        aria-describedby={label ? valueId : undefined}
        className={cn('justify-between', triggerClassName)}
        onClick={() => onOpenChange(true)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span id={valueId} className="truncate">
            {value}
          </span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </Button>

      {/* R11: 860 px wide becomes the nearest size, xl (960); 620 px tall is h-155. */}
      <DialogContent size="xl" className="h-155" initialFocus={inputRef}>
        <DialogTitle className="sr-only">Select model</DialogTitle>
        <DialogDescription className="sr-only">
          Search and filter providers to choose a model.
        </DialogDescription>

        <div className="flex shrink-0 items-center gap-2 border-b border-line-soft px-4 py-3 pr-12">
          <SearchField
            className="min-w-0 flex-1"
            ref={inputRef}
            role="combobox"
            aria-label="Search models"
            aria-autocomplete="list"
            aria-expanded={hasModels}
            aria-controls={hasModels ? listId : undefined}
            aria-activedescendant={
              active === null ? undefined : listboxOptionId(listId, active)
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              // cmdk's steps: they stop at the ends rather than wrapping.
              const next = listboxStep(active, models.length, event, {
                loop: false,
              })
              if (next !== undefined) {
                onSelectedValueChange(models[next].value)
              } else if (event.key === 'Enter' && active !== null) {
                onSelect(models[active])
              } else {
                return
              }
              event.preventDefault()
            }}
            placeholder="Search models..."
          />
          {/*
            The keyboard's way to star a model: the active row's star, beside
            the field. A control inside an option is out of a listbox's reach
            (nested-interactive), so a row's star is for the pointer only.
          */}
          <IconButton
            variant="quiet"
            size="sm"
            label={
              activeModel === null
                ? 'Add to favorites'
                : activeModel.favorite
                  ? `Remove ${activeModel.modelLabel} from favorites`
                  : `Add ${activeModel.modelLabel} to favorites`
            }
            pressed={activeModel?.favorite ?? false}
            disabled={activeModel === null}
            className={cn(activeModel?.favorite && favoriteInk)}
            onClick={() => {
              if (activeModel) onToggleFavorite(activeModel)
            }}
          >
            <Star
              aria-hidden
              className={cn(
                'size-3.5',
                activeModel?.favorite && 'fill-current',
              )}
            />
          </IconButton>
        </div>

        <div className={dialogSplit}>
          <aside className={cn(dialogRail, 'min-w-0 p-2 sm:w-44')}>
            <div className="app-scrollbar flex gap-1 overflow-x-auto sm:block sm:max-h-full sm:space-y-1 sm:overflow-y-auto">
              <ModelPickerProviderFilterButton
                id="all"
                label="All"
                count={totalModelCount}
                selected={providerFilterId === 'all'}
                onSelect={onProviderFilterChange}
              />
              {providers.map((provider) => (
                <ModelPickerProviderFilterButton
                  key={provider.id}
                  id={provider.id}
                  label={provider.vendorLabel || provider.label}
                  count={provider.count}
                  selected={providerFilterId === provider.id}
                  provider={provider}
                  onSelect={onProviderFilterChange}
                />
              ))}
            </div>
          </aside>

          {hasModels ? (
            <Listbox
              // A new search or filter starts the list from its top.
              key={`${providerFilterId}:${query}`}
              id={listId}
              aria-label="Models"
              active={active}
              className="app-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto p-2"
            >
              {models.map((item, index) => (
                <ListboxOption
                  key={item.value}
                  index={index}
                  onPick={() => onSelect(item)}
                  onHover={() => onSelectedValueChange(item.value)}
                  className="items-start gap-3 px-3 py-3"
                >
                  <ProviderIcon
                    providerId={item.providerId}
                    vendorLabel={item.providerLabel}
                    name={item.providerName}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="whitespace-normal break-words font-medium leading-snug">
                        {item.modelLabel}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {/* The pointer's star; the keyboard's is beside the field. */}
                        <span
                          aria-hidden
                          data-testid="model-favorite-star"
                          className={cn(
                            'flex size-6 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink',
                            item.favorite && favoriteInk,
                          )}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            onToggleFavorite(item)
                          }}
                        >
                          <Star
                            className={cn(
                              'size-3.5',
                              item.favorite && 'fill-current',
                            )}
                          />
                        </span>
                        {item.selected ? (
                          <>
                            <Check aria-hidden className="h-4 w-4 shrink-0" />
                            {/* The highlight is the active row: the model in use says so in words. */}
                            <span className="sr-only">(in use)</span>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div className="break-all text-xs leading-snug text-ink-muted">
                      {item.modelId}
                    </div>
                    {item.modelDescription || item.contextWindowTokens ? (
                      <div className="flex flex-wrap gap-1 text-2xs leading-snug text-ink-muted">
                        {item.modelDescription ? (
                          <span>{item.modelDescription}</span>
                        ) : null}
                        {item.contextWindowTokens ? (
                          <span>
                            {formatContextWindowTokens(
                              item.contextWindowTokens,
                            )}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex min-w-0 items-center gap-1.5 text-2xs leading-snug text-ink-muted">
                      <span className="truncate">{item.providerLabel}</span>
                      {item.providerBadge ? (
                        <Tooltip label={item.providerBadge.title}>
                          <Badge tone="warning" shape="label">
                            {item.providerBadge.label}
                          </Badge>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                </ListboxOption>
              ))}
            </Listbox>
          ) : (
            <EmptyState variant="plain" detail="No models found." />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
