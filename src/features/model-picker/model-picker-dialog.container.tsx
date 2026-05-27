import { useMemo, useRef, useState } from 'react'
import { useAppSettingsStore } from '@/entities/app-settings'
import type { ProviderInfo } from '@/entities/session'
import { ModelPickerDialogPresentational } from './model-picker-dialog.presentational'
import {
  createFavoriteModelKeySet,
  createFavoriteModelOrderMap,
  MODEL_PICKER_FAVORITES_FILTER_ID,
  modelPickerFavoriteKey,
  toggleFavoriteModel,
} from './model-picker-dialog.pure'
import type {
  ModelPickerDialogProps,
  ModelPickerModelItem,
  ModelPickerProviderFilter,
} from './model-picker-dialog.types'

export function ModelPickerDialog({
  providers,
  selectedProviderId,
  selectedModelId,
  value,
  onChange,
  disabled = false,
  triggerVariant = 'outline',
  triggerSize = 'sm',
  triggerClassName,
}: ModelPickerDialogProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [providerFilterId, setProviderFilterId] = useState(
    selectedProviderId ?? 'all',
  )
  const [selectedValue, setSelectedValue] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const appSettings = useAppSettingsStore((state) => state.settings)
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const favoriteModels = appSettings.favoriteModels?.items ?? []
  const favoriteKeySet = useMemo(
    () => createFavoriteModelKeySet(favoriteModels),
    [favoriteModels],
  )
  const favoriteOrder = useMemo(
    () => createFavoriteModelOrderMap(favoriteModels),
    [favoriteModels],
  )
  const visibleFavoriteCount = useMemo(
    () =>
      providers.reduce(
        (total, provider) =>
          total +
          provider.modelOptions.filter((model) =>
            favoriteKeySet.has(modelPickerFavoriteKey(provider.id, model.id)),
          ).length,
        0,
      ),
    [favoriteKeySet, providers],
  )

  const providerFilters = useMemo(
    () => [
      ...(visibleFavoriteCount > 0
        ? [
            {
              id: MODEL_PICKER_FAVORITES_FILTER_ID,
              label: 'Favorites',
              name: 'Favorites',
              vendorLabel: '',
              count: visibleFavoriteCount,
              kind: 'favorites' as const,
            },
          ]
        : []),
      ...providers
        .filter((provider) => provider.modelOptions.length > 0)
        .map<ModelPickerProviderFilter>((provider) => ({
          id: provider.id,
          label: provider.vendorLabel || provider.name,
          name: provider.name,
          vendorLabel: provider.vendorLabel,
          count: provider.modelOptions.length,
          kind: 'provider',
        })),
    ],
    [providers, visibleFavoriteCount],
  )

  const modelItems = useMemo(
    () =>
      flattenModelItems(
        providers,
        selectedProviderId,
        selectedModelId,
        providerFilterId,
        normalizedQuery,
        favoriteKeySet,
        favoriteOrder,
      ),
    [
      providers,
      selectedProviderId,
      selectedModelId,
      providerFilterId,
      normalizedQuery,
      favoriteKeySet,
      favoriteOrder,
    ],
  )

  const totalModelCount = useMemo(
    () =>
      providers.reduce(
        (total, provider) => total + provider.modelOptions.length,
        0,
      ),
    [providers],
  )

  const isDisabled = disabled || totalModelCount === 0

  return (
    <ModelPickerDialogPresentational
      open={open}
      query={query}
      providerFilterId={providerFilterId}
      selectedValue={selectedValue}
      value={value}
      providers={providerFilters}
      models={modelItems}
      totalModelCount={totalModelCount}
      isDisabled={isDisabled}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
      inputRef={inputRef}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setQuery('')
          setProviderFilterId(selectedProviderId ?? 'all')
          setSelectedValue(undefined)
        }
      }}
      onQueryChange={setQuery}
      onProviderFilterChange={(nextProviderFilterId) => {
        setProviderFilterId(nextProviderFilterId)
        setSelectedValue(undefined)
      }}
      onSelectedValueChange={setSelectedValue}
      onSelect={(item) => {
        onChange(item.providerId, item.modelId)
        setOpen(false)
        setQuery('')
      }}
      onToggleFavorite={(item) => {
        const currentSettings = useAppSettingsStore.getState().settings
        const nextFavorites = toggleFavoriteModel(
          currentSettings.favoriteModels?.items ?? [],
          {
            providerId: item.providerId,
            modelId: item.modelId,
          },
        )
        void saveAppSettings({
          ...currentSettings,
          favoriteModels: { items: nextFavorites },
        })
      }}
    />
  )
}

function flattenModelItems(
  providers: ProviderInfo[],
  selectedProviderId: string | null,
  selectedModelId: string | null,
  providerFilterId: string,
  normalizedQuery: string,
  favoriteKeySet: Set<string>,
  favoriteOrder: Map<string, number>,
): ModelPickerModelItem[] {
  const items = providers.flatMap((provider) => {
    if (
      providerFilterId !== 'all' &&
      providerFilterId !== MODEL_PICKER_FAVORITES_FILTER_ID &&
      provider.id !== providerFilterId
    ) {
      return []
    }

    const providerLabel = provider.vendorLabel || provider.name

    return provider.modelOptions.flatMap((model) => {
      if (
        normalizedQuery &&
        !matchesQuery(provider, model.id, model.label, normalizedQuery)
      ) {
        return []
      }

      const favoriteKey = modelPickerFavoriteKey(provider.id, model.id)
      const favorite = favoriteKeySet.has(favoriteKey)
      if (providerFilterId === MODEL_PICKER_FAVORITES_FILTER_ID && !favorite) {
        return []
      }

      return [
        {
          value: `${provider.id}:${model.id}`,
          providerId: provider.id,
          providerName: provider.name,
          providerLabel,
          modelId: model.id,
          modelLabel: model.label,
          selected:
            provider.id === selectedProviderId && model.id === selectedModelId,
          favorite,
        },
      ]
    })
  })

  return items.sort((a, b) => {
    const aOrder = favoriteOrder.get(
      modelPickerFavoriteKey(a.providerId, a.modelId),
    )
    const bOrder = favoriteOrder.get(
      modelPickerFavoriteKey(b.providerId, b.modelId),
    )
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
    if (aOrder !== undefined) return -1
    if (bOrder !== undefined) return 1
    return 0
  })
}

function matchesQuery(
  provider: ProviderInfo,
  modelId: string,
  modelLabel: string,
  normalizedQuery: string,
): boolean {
  return [
    modelLabel,
    modelId,
    provider.id,
    provider.name,
    provider.vendorLabel,
  ].some((entry) => entry.toLowerCase().includes(normalizedQuery))
}
