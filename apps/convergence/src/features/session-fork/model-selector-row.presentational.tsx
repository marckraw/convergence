import type { FC, ReactNode } from 'react'
import {
  getProviderLifecycleBadge,
  type ProviderInfo,
  type ReasoningEffort,
  type ResolvedProviderSelection,
} from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@convergence/ui'

interface ModelSelectorRowProps {
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
}

/** A provider as its choice reads: its mark, its vendor, and ALPHA where it is early. */
function providerChoice(provider: ProviderInfo): ReactNode {
  const badge = getProviderLifecycleBadge(provider)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ProviderIcon
        providerId={provider.id}
        vendorLabel={provider.vendorLabel}
        name={provider.name}
      />
      <span className="truncate">{provider.vendorLabel || provider.name}</span>
      {badge ? <Badge tone="warning">{badge.label}</Badge> : null}
    </span>
  )
}

/**
 * Provider + model + effort, shared by the fork composer's "run-with"
 * selection and the summary section's "summarize-with" selection. The
 * provider and the effort are a few fixed choices, so Selects (R9, DLG-30),
 * as Settings has them; the model is the model picker. Each is named by
 * what it picks, its value shown in it (DLG-7).
 */
export const ModelSelectorRow: FC<ModelSelectorRowProps> = ({
  providers,
  selection,
  onProviderChange,
  onModelChange,
  onEffortChange,
}) => {
  const providerItems = providers.map((provider) => ({
    value: provider.id,
    label: providerChoice(provider),
  }))
  const efforts = selection.model?.effortOptions ?? []
  const effortItems = efforts.map((effort) => ({
    value: effort.id,
    label: effort.label,
  }))

  return (
    <>
      <Select
        items={providerItems}
        value={selection.providerId || null}
        onValueChange={(next: string) => onProviderChange(next)}
      >
        <SelectTrigger size="md" aria-label="Provider" className="text-xs">
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((provider) => (
            <SelectItem key={provider.id} value={provider.id}>
              {providerChoice(provider)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ModelPickerDialog
        providers={providers}
        selectedProviderId={selection.providerId}
        selectedModelId={selection.modelId}
        value={selection.model?.label ?? 'Select model'}
        label="Model"
        onChange={(providerId, modelId) => onModelChange(modelId, providerId)}
        triggerClassName="px-2 text-xs"
      />
      {effortItems.length > 0 && (
        <Select
          items={effortItems}
          value={selection.effortId || null}
          onValueChange={(next: string) =>
            onEffortChange(next as ReasoningEffort)
          }
        >
          <SelectTrigger
            size="md"
            aria-label="Reasoning effort"
            className="text-xs"
          >
            <SelectValue placeholder="Select effort" />
          </SelectTrigger>
          <SelectContent>
            {efforts.map((effort) => (
              <SelectItem key={effort.id} value={effort.id}>
                {effort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  )
}
