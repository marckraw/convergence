import type { FC, RefObject } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button, type ButtonProps } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog'
import { ProviderIcon } from '@/shared/ui/provider-icon.pure'
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
}

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
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
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
      className="h-[min(620px,calc(100vh-2rem))] w-[min(860px,calc(100vw-2rem))] p-0"
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        inputRef.current?.focus()
      }}
    >
      <DialogTitle className="sr-only">Select model</DialogTitle>
      <DialogDescription className="sr-only">
        Search and filter providers to choose a model.
      </DialogDescription>

      <Command
        shouldFilter={false}
        label="Model picker"
        value={selectedValue}
        onValueChange={onSelectedValueChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3 pr-12">
          <Search className="h-4 w-4 text-muted-foreground" />
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={onQueryChange}
            placeholder="Search models..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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

          <CommandList
            key={`${providerFilterId}:${query}`}
            className="app-scrollbar min-h-0 overflow-y-auto p-2"
          >
            {models.length === 0 ? (
              <CommandEmpty className="px-3 py-8 text-center text-sm text-muted-foreground">
                No models found.
              </CommandEmpty>
            ) : (
              models.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => onSelect(item)}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
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
                      {item.selected ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : null}
                    </div>
                    <div className="break-all text-xs leading-snug text-muted-foreground">
                      {item.modelId}
                    </div>
                    <div className="text-[11px] leading-snug text-muted-foreground">
                      {item.providerLabel}
                    </div>
                  </div>
                </CommandItem>
              ))
            )}
          </CommandList>
        </div>
      </Command>
    </DialogContent>
  </Dialog>
)
