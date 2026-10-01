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
  EmptyState,
  IconButton,
  Listbox,
  ListboxOption,
  listboxOptionId,
  listboxStep,
  SearchField,
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
  const selectedIndex = models.findIndex((item) => item.value === selectedValue)
  const active = models.length === 0 ? null : Math.max(selectedIndex, 0)
  const hasModels = models.length > 0

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
        aria-label={value}
        className={cn('justify-between', triggerClassName)}
        onClick={() => onOpenChange(true)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{value}</span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </Button>

      <DialogContent
        className="h-[min(620px,calc(100vh-2rem))] w-[min(860px,calc(100vw-2rem))]"
        initialFocus={inputRef}
      >
        <DialogTitle className="sr-only">Select model</DialogTitle>
        <DialogDescription className="sr-only">
          Search and filter providers to choose a model.
        </DialogDescription>

        <div className="shrink-0 border-b border-white/10 px-4 py-3 pr-12">
          <SearchField
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
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-white/10 p-2 sm:border-r sm:border-b-0">
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
              className="app-scrollbar min-h-0 overflow-y-auto p-2"
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
                        <IconButton
                          type="button"
                          variant="ghost"
                          size="xs"
                          label={
                            item.favorite
                              ? `Remove ${item.modelLabel} from favorites`
                              : `Add ${item.modelLabel} to favorites`
                          }
                          className={cn(
                            'text-muted-foreground hover:bg-muted hover:text-foreground',
                            item.favorite &&
                              'text-yellow-600 hover:text-yellow-700 dark:text-yellow-300 dark:hover:text-yellow-200',
                          )}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            onToggleFavorite(item)
                          }}
                        >
                          <Star
                            className={cn(
                              'h-3.5 w-3.5',
                              item.favorite && 'fill-current',
                            )}
                          />
                        </IconButton>
                        {item.selected ? (
                          <>
                            <Check aria-hidden className="h-4 w-4 shrink-0" />
                            {/* The highlight is the active row: the model in use says so in words. */}
                            <span className="sr-only">(in use)</span>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div className="break-all text-xs leading-snug text-muted-foreground">
                      {item.modelId}
                    </div>
                    {item.modelDescription || item.contextWindowTokens ? (
                      <div className="flex flex-wrap gap-1 text-[11px] leading-snug text-muted-foreground">
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
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
                      <span className="truncate">{item.providerLabel}</span>
                      {item.providerBadge ? (
                        <Badge
                          tone="warning"
                          shape="label"
                          title={item.providerBadge.title}
                        >
                          {item.providerBadge.label}
                        </Badge>
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
