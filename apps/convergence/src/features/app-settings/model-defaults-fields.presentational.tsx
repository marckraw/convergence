import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import { SettingsSection } from '@convergence/ui'

/**
 * Which model a provider falls back to when none is chosen for the task:
 * naming wants the provider's fast model, forking its default one.
 */
export type ModelDefaultsFallback = 'fast' | 'default'

interface ModelDefaultsFieldsProps {
  providers: ProviderInfo[]
  /** The model chosen per provider id, where one is. */
  chosen: Record<string, string>
  fallback: ModelDefaultsFallback
  /**
   * The task the models are for, as the list's heading says it ("Session
   * naming"): each row is a region named for it and its provider, so the
   * same provider in two lists is two regions.
   */
  purpose: string
  onModelChange: (providerId: string, modelId: string) => void
}

function resolveSelectedModelId(
  provider: ProviderInfo,
  chosen: string | undefined,
  fallback: ModelDefaultsFallback,
): string {
  const offers = (id: string | null | undefined): id is string =>
    !!id && provider.modelOptions.some((model) => model.id === id)
  if (offers(chosen)) return chosen
  if (fallback === 'fast' && offers(provider.fastModelId)) {
    return provider.fastModelId
  }
  return provider.defaultModelId
}

/**
 * One row per provider: the model a task runs on, for session naming or for
 * the summary a fork starts from (DLG-11: the two were the same component
 * twice). Each is a SettingsSection row with the provider's model picker.
 */
export const ModelDefaultsFields: FC<ModelDefaultsFieldsProps> = ({
  providers,
  chosen,
  fallback,
  purpose,
  onModelChange,
}) => (
  <div className="space-y-4">
    {providers.map((provider) => {
      const selectedId = resolveSelectedModelId(
        provider,
        chosen[provider.id],
        fallback,
      )
      const selectedLabel =
        provider.modelOptions.find((model) => model.id === selectedId)?.label ??
        selectedId
      return (
        <SettingsSection
          key={provider.id}
          compact
          title={provider.vendorLabel || provider.name}
          label={`${purpose}: ${provider.vendorLabel || provider.name}`}
        >
          <ModelPickerDialog
            providers={[provider]}
            selectedProviderId={provider.id}
            selectedModelId={selectedId}
            value={selectedLabel}
            onChange={(_, modelId) => onModelChange(provider.id, modelId)}
            triggerClassName="px-2 text-xs"
          />
        </SettingsSection>
      )
    })}
  </div>
)
