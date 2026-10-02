import type { FC, ReactNode } from 'react'
import {
  effortSelectItems,
  providerSelectItems,
  type ProviderInfo,
  type ProviderSelectItem,
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

/**
 * A provider as its choice reads: its mark, its vendor, and ALPHA where it is
 * early. The words come from the composer's own mapping (CONV-17).
 */
function providerChoice(item: ProviderSelectItem): ReactNode {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ProviderIcon
        providerId={item.id}
        vendorLabel={item.vendorLabel}
        name={item.name}
      />
      <span className="truncate">{item.label}</span>
      {item.badge ? <Badge tone="warning">{item.badge.label}</Badge> : null}
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
  const choices = providerSelectItems(
    providers.map((descriptor) => ({ descriptor })),
  )
  const providerItems = choices.map((choice) => ({
    value: choice.id,
    label: providerChoice(choice),
  }))
  const efforts = effortSelectItems(selection)
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
          {choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {providerChoice(choice)}
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
