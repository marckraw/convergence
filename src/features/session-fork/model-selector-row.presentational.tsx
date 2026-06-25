import type { FC } from 'react'
import {
  getProviderLifecycleBadge,
  type ProviderInfo,
  type ReasoningEffort,
  type ResolvedProviderSelection,
} from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import { SessionStartSelect } from '@/features/session-start'

interface ModelSelectorRowProps {
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
}

/**
 * Provider + model + effort pills, shared by the fork composer's "run-with"
 * selection and the summary section's "summarize-with" selection.
 */
export const ModelSelectorRow: FC<ModelSelectorRowProps> = ({
  providers,
  selection,
  onProviderChange,
  onModelChange,
  onEffortChange,
}) => {
  const providerItems = providers.map((provider) => ({
    id: provider.id,
    label: provider.vendorLabel || provider.name,
    description:
      provider.vendorLabel && provider.vendorLabel !== provider.name
        ? provider.name
        : undefined,
    badge: getProviderLifecycleBadge(provider) ?? undefined,
  }))
  const effortItems =
    selection.model?.effortOptions.map((effort) => ({
      id: effort.id,
      label: effort.label,
      description: effort.description,
    })) ?? []

  return (
    <>
      <SessionStartSelect
        selectedId={selection.providerId}
        value={selection.providerLabel || 'Select provider'}
        items={providerItems}
        onChange={onProviderChange}
      />
      <ModelPickerDialog
        providers={providers}
        selectedProviderId={selection.providerId}
        selectedModelId={selection.modelId}
        value={selection.model?.label ?? 'Select model'}
        onChange={(providerId, modelId) => onModelChange(modelId, providerId)}
        triggerClassName="px-2 text-xs"
      />
      {effortItems.length > 0 && (
        <SessionStartSelect
          selectedId={selection.effortId}
          value={selection.effort?.label ?? 'Select effort'}
          items={effortItems}
          onChange={(id) => onEffortChange(id as ReasoningEffort)}
        />
      )}
    </>
  )
}
