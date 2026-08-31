import { useMemo, useState, type FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { PiModelVisibilityFields } from './pi-model-visibility.presentational'

interface PiModelVisibilityContainerProps {
  provider: ProviderInfo | undefined
  selectedModelIds: string[]
  onToggleModel: (modelId: string, next: boolean) => void
}

export const PiModelVisibilityContainer: FC<
  PiModelVisibilityContainerProps
> = ({ provider, selectedModelIds, onToggleModel }) => {
  const [query, setQuery] = useState('')
  const models = provider?.modelOptions ?? []
  const modelsJsonModels = models.filter(
    (model) => model.source === 'pi-models-json',
  )
  const optionalModels = models.filter(
    (model) => model.source !== 'pi-models-json',
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptionalModels = normalizedQuery
    ? optionalModels.filter((model) =>
        [model.label, model.id].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : optionalModels
  const selectedModelIdsSet = useMemo(
    () => new Set(selectedModelIds),
    [selectedModelIds],
  )

  return (
    <PiModelVisibilityFields
      providerExists={!!provider}
      modelsJsonModels={modelsJsonModels}
      optionalModels={filteredOptionalModels}
      query={query}
      selectedModelIds={selectedModelIds}
      selectedModelIdsSet={selectedModelIdsSet}
      onQueryChange={setQuery}
      onToggleModel={onToggleModel}
    />
  )
}
