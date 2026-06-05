import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import { SettingsControlField } from './settings-control-field.presentational'

interface GuidedReviewModelDefaultsFieldsProps {
  providers: ProviderInfo[]
  guidedReviewDraft: Record<string, string>
  onGuidedReviewModelChange: (providerId: string, modelId: string) => void
}

function resolveSelectedModelId(
  provider: ProviderInfo,
  draftValue: string | undefined,
): string {
  if (draftValue && provider.modelOptions.some((m) => m.id === draftValue)) {
    return draftValue
  }
  if (
    provider.id === 'claude-code' &&
    provider.modelOptions.some((m) => m.id === 'opus')
  ) {
    return 'opus'
  }
  if (
    provider.id === 'codex' &&
    provider.modelOptions.some((m) => m.id === 'gpt-5.5')
  ) {
    return 'gpt-5.5'
  }
  return provider.defaultModelId
}

export const GuidedReviewModelDefaultsFields: FC<
  GuidedReviewModelDefaultsFieldsProps
> = ({ providers, guidedReviewDraft, onGuidedReviewModelChange }) => (
  <div className="space-y-4">
    {providers.map((provider) => {
      const selectedId = resolveSelectedModelId(
        provider,
        guidedReviewDraft[provider.id],
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
              onGuidedReviewModelChange(provider.id, modelId)
            }
            triggerClassName="px-2 text-xs"
          />
        </SettingsControlField>
      )
    })}
  </div>
)
