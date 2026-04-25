import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { SessionStartSelect } from '@/features/session-start'
import { SettingsControlField } from './settings-control-field.presentational'

interface ExtractionModelDefaultsFieldsProps {
  providers: ProviderInfo[]
  extractionDraft: Record<string, string>
  onExtractionModelChange: (providerId: string, modelId: string) => void
}

function resolveSelectedModelId(
  provider: ProviderInfo,
  draftValue: string | undefined,
): string {
  if (draftValue && provider.modelOptions.some((m) => m.id === draftValue)) {
    return draftValue
  }
  return provider.defaultModelId
}

export const ExtractionModelDefaultsFields: FC<
  ExtractionModelDefaultsFieldsProps
> = ({ providers, extractionDraft, onExtractionModelChange }) => (
  <div className="space-y-4">
    {providers.map((provider) => {
      const selectedId = resolveSelectedModelId(
        provider,
        extractionDraft[provider.id],
      )
      const selectedLabel =
        provider.modelOptions.find((m) => m.id === selectedId)?.label ??
        selectedId
      const items = provider.modelOptions.map((model) => ({
        id: model.id,
        label: model.label,
        description: model.id,
      }))
      return (
        <SettingsControlField
          key={provider.id}
          title={provider.vendorLabel || provider.name}
          description="Model used to summarise conversations when forking a session."
        >
          <SessionStartSelect
            selectedId={selectedId}
            value={selectedLabel}
            items={items}
            onChange={(id) => onExtractionModelChange(provider.id, id)}
          />
        </SettingsControlField>
      )
    })}
  </div>
)
