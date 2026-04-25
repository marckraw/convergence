import type { FC } from 'react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import { SessionStartSelect } from '@/features/session-start'
import { SettingsControlField } from './settings-control-field.presentational'

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
      <SettingsControlField
        title="Default provider"
        description="Used as the provider for every new session unless you override it."
      >
        <SessionStartSelect
          selectedId={selection.providerId}
          value={selection.providerLabel || 'Select provider'}
          items={providerItems}
          onChange={onProviderChange}
        />
      </SettingsControlField>

      <SettingsControlField
        title="Default model"
        description="Model that runs by default for the selected provider."
      >
        <SessionStartSelect
          selectedId={selection.modelId}
          value={selection.model?.label ?? 'Select model'}
          items={modelItems}
          onChange={onModelChange}
        />
      </SettingsControlField>

      {effortItems.length > 0 && (
        <SettingsControlField
          title="Default reasoning effort"
          description="Reasoning effort the model uses by default."
        >
          <SessionStartSelect
            selectedId={selection.effortId}
            value={selection.effort?.label ?? 'Select effort'}
            items={effortItems}
            onChange={(id) => onEffortChange(id as ReasoningEffort)}
          />
        </SettingsControlField>
      )}
    </div>
  )
}
