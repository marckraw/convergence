import type { ProviderInfo } from '@/entities/session'
import type { ProviderLifecycleBadge } from '@/entities/session'
import type { ButtonProps, ControlDensity, ControlSize } from '@convergence/ui'

/**
 * How the trigger looks: a Button's variant, or `field`, the field frame
 * SelectTrigger and Combobox wear (DLG-15), where it sits among fields.
 */
export type ModelPickerTriggerVariant = ButtonProps['variant'] | 'field'

export interface ModelPickerDialogProps {
  providers: ProviderInfo[]
  selectedProviderId: string | null
  selectedModelId: string | null
  value: string
  /**
   * The field it picks for ("Model", "Default model"): the trigger's name,
   * with the chosen model read as its description (DLG-7). Without one, as
   * in the composer's chip, the trigger is named by the model it shows.
   */
  label?: string
  onChange: (providerId: string, modelId: string) => void
  disabled?: boolean
  triggerVariant?: ModelPickerTriggerVariant
  /** R3's scale; never a size in `triggerClassName`. */
  triggerSize?: ControlSize
  /** A `field` trigger's words: `compact` is 12 px at any height (ruling 10). */
  triggerDensity?: ControlDensity
  /** Its width and place only: a size or a text size is a prop (R3). */
  triggerClassName?: string
}

export interface ModelPickerProviderFilter {
  id: string
  label: string
  name: string
  vendorLabel: string
  count: number
  kind?: 'provider' | 'favorites'
  badge?: ProviderLifecycleBadge
}

export interface ModelPickerModelItem {
  value: string
  providerId: string
  providerName: string
  providerLabel: string
  providerBadge?: ProviderLifecycleBadge
  modelId: string
  modelLabel: string
  modelDescription?: string
  contextWindowTokens?: number | null
  selected: boolean
  favorite: boolean
}
