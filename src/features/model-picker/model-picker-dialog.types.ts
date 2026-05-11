import type { ProviderInfo } from '@/entities/session'
import type { ButtonProps } from '@/shared/ui/button'

export interface ModelPickerDialogProps {
  providers: ProviderInfo[]
  selectedProviderId: string | null
  selectedModelId: string | null
  value: string
  onChange: (providerId: string, modelId: string) => void
  disabled?: boolean
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
  triggerClassName?: string
}

export interface ModelPickerProviderFilter {
  id: string
  label: string
  name: string
  vendorLabel: string
  count: number
}

export interface ModelPickerModelItem {
  value: string
  providerId: string
  providerName: string
  providerLabel: string
  modelId: string
  modelLabel: string
  selected: boolean
}
