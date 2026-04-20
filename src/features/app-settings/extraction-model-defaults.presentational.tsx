import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { SessionStartSelect } from '@/features/session-start/session-start-select.presentational'

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
        <div key={provider.id} className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {provider.vendorLabel || provider.name}
          </label>
          <SessionStartSelect
            selectedId={selectedId}
            value={selectedLabel}
            items={items}
            onChange={(id) => onExtractionModelChange(provider.id, id)}
          />
          <p className="text-[11px] text-muted-foreground">
            Model used to summarise conversations when forking a session.
          </p>
        </div>
      )
    })}
  </div>
)
