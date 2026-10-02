import type { ProviderBrand } from '@/shared/ui/provider-icon.pure'

/**
 * Selected Whisper palette, as the provider hue tokens (R1's category hues,
 * `--provider-*`); providers without a selected colour stay neutral.
 */
export const providerCardTints: Record<ProviderBrand, string | undefined> = {
  openai: 'var(--provider-openai)',
  anthropic: 'var(--provider-anthropic)',
  pi: 'var(--provider-pi)',
  cursor: 'var(--provider-cursor)',
  google: 'var(--provider-google)',
  openrouter: undefined,
}
