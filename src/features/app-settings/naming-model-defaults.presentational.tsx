import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { SessionStartSelect } from '@/features/session-start'
import { SettingsControlField } from './settings-control-field.presentational'

interface NamingModelDefaultsFieldsProps {
  providers: ProviderInfo[]
  namingDraft: Record<string, string>
  onNamingModelChange: (providerId: string, modelId: string) => void
}

function resolveSelectedModelId(
  provider: ProviderInfo,
  draftValue: string | undefined,
): string {
  if (draftValue && provider.modelOptions.some((m) => m.id === draftValue)) {
    return draftValue
  }
  if (
    provider.fastModelId &&
    provider.modelOptions.some((m) => m.id === provider.fastModelId)
  ) {
    return provider.fastModelId
  }
  return provider.defaultModelId
}

export const NamingModelDefaultsFields: FC<NamingModelDefaultsFieldsProps> = ({
  providers,
  namingDraft,
  onNamingModelChange,
}) => (
  <div className="space-y-4">
    {providers.map((provider) => {
      const selectedId = resolveSelectedModelId(
        provider,
        namingDraft[provider.id],
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
          description="Model used to auto-generate session names for this provider."
        >
          <SessionStartSelect
            selectedId={selectedId}
            value={selectedLabel}
            items={items}
            onChange={(id) => onNamingModelChange(provider.id, id)}
          />
        </SettingsControlField>
      )
    })}
  </div>
)
