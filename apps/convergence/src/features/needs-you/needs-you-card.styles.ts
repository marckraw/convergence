import type { ProviderBrand } from '@/shared/ui/provider-icon.pure'

/** Selected Whisper palette; providers without a selected color stay neutral. */
export const providerCardTints: Record<ProviderBrand, string | undefined> = {
  openai: '#5FAF9C',
  anthropic: '#CC917B',
  pi: '#AE94DB',
  cursor: '#A5B3C7',
  google: '#83A4E2',
  openrouter: undefined,
}
