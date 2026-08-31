import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
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
      return (
        <SettingsControlField
          key={provider.id}
          title={provider.vendorLabel || provider.name}
        >
          <ModelPickerDialog
            providers={[provider]}
            selectedProviderId={provider.id}
            selectedModelId={selectedId}
            value={selectedLabel}
            onChange={(_, modelId) =>
              onExtractionModelChange(provider.id, modelId)
            }
            triggerClassName="px-2 text-xs"
          />
        </SettingsControlField>
      )
    })}
  </div>
)
