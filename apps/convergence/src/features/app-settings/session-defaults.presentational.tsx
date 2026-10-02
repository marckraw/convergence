import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import type { FC, ReactNode } from 'react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import { getProviderLifecycleBadge } from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
} from '@convergence/ui'
import { ProviderSettingsMetadata } from './provider-settings-metadata.presentational'

interface SessionDefaultsFieldsProps {
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
}

/** A provider as its row reads: its mark, its vendor, and ALPHA where it is early. */
function renderProviderChoice(provider: ProviderInfo): ReactNode {
  const badge = getProviderLifecycleBadge(provider)
  return (
    <span key={provider.id} className="flex min-w-0 items-center gap-2">
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
 * The defaults a new session starts from (R9): the provider and the effort
 * are a few fixed choices, so Selects; the model is the model picker.
 */
export const SessionDefaultsFields: FC<SessionDefaultsFieldsProps> = ({
  providers,
  selection,
  onProviderChange,
  onModelChange,
  onEffortChange,
}) => {
  const providerItems: Record<string, ReactNode> = Object.fromEntries(
    providers.map((provider) => [provider.id, renderProviderChoice(provider)]),
  )
  const efforts = selection.model?.effortOptions ?? []
  const effortItems = efforts.map((effort) => ({
    value: effort.id,
    label: effort.label,
  }))

  return (
    <div className="space-y-4">
      <SettingsSection
        compact
        title="Default provider"
        description="Used as the provider for every new session unless you override it."
      >
        <Select
          items={providerItems}
          value={selection.providerId || null}
          onValueChange={(next: string) => onProviderChange(next)}
          disabled={providers.length === 0}
        >
          <SelectTrigger
            size="md"
            aria-label="Default provider"
            className="min-w-40 text-xs"
          >
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {renderProviderChoice(provider)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsSection>

      <SettingsSection
        compact
        title="Default model"
        description="Model that runs by default for the selected provider."
      >
        <ModelPickerDialog
          providers={providers}
          selectedProviderId={selection.providerId}
          selectedModelId={selection.modelId}
          value={selection.model?.label ?? 'Select model'}
          onChange={(providerId, modelId) => onModelChange(modelId, providerId)}
          triggerClassName="px-2 text-xs"
        />
      </SettingsSection>

      {effortItems.length > 0 && (
        <SettingsSection
          compact
          title="Default reasoning effort"
          description="Reasoning effort the model uses by default."
        >
          <Select
            items={effortItems}
            value={selection.effortId || null}
            onValueChange={(next: ReasoningEffort) => onEffortChange(next)}
          >
            <SelectTrigger
              size="md"
              aria-label="Default reasoning effort"
              className="min-w-32 text-xs"
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
        </SettingsSection>
      )}

      <ProviderSettingsMetadata provider={selection.provider} />
    </div>
  )
}
