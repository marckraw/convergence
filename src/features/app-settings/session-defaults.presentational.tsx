import type { FC } from 'react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import { SessionStartSelect } from '@/features/session-start/session-start-select.presentational'

interface SessionDefaultsFieldsProps {
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
}

export const SessionDefaultsFields: FC<SessionDefaultsFieldsProps> = ({
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
  }))
  const modelItems =
    selection.provider?.modelOptions.map((model) => ({
      id: model.id,
      label: model.label,
      description: model.id,
    })) ?? []
  const effortItems =
    selection.model?.effortOptions.map((effort) => ({
      id: effort.id,
      label: effort.label,
      description: effort.description,
    })) ?? []

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="app-settings-provider"
          className="text-xs font-medium text-foreground"
        >
          Default provider
        </label>
        <SessionStartSelect
          selectedId={selection.providerId}
          value={selection.providerLabel || 'Select provider'}
          items={providerItems}
          onChange={onProviderChange}
        />
        <p className="text-[11px] text-muted-foreground">
          Used as the provider for every new session unless you override it.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="app-settings-model"
          className="text-xs font-medium text-foreground"
        >
          Default model
        </label>
        <SessionStartSelect
          selectedId={selection.modelId}
          value={selection.model?.label ?? 'Select model'}
          items={modelItems}
          onChange={onModelChange}
        />
        <p className="text-[11px] text-muted-foreground">
          Model that runs by default for the selected provider.
        </p>
      </div>

      {effortItems.length > 0 && (
        <div className="space-y-1.5">
          <label
            htmlFor="app-settings-effort"
            className="text-xs font-medium text-foreground"
          >
            Default reasoning effort
          </label>
          <SessionStartSelect
            selectedId={selection.effortId}
            value={selection.effort?.label ?? 'Select effort'}
            items={effortItems}
            onChange={(id) => onEffortChange(id as ReasoningEffort)}
          />
          <p className="text-[11px] text-muted-foreground">
            Reasoning effort the model uses by default.
          </p>
        </div>
      )}
    </div>
  )
}
