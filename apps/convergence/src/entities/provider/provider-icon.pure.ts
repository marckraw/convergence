export type ProviderBrand =
  | 'anthropic'
  | 'openai'
  | 'pi'
  | 'cursor'
  | 'google'
  | 'openrouter'

const BRANDS: Record<string, { brand: ProviderBrand; label: string }> = {
  'claude-code': { brand: 'anthropic', label: 'Anthropic' },
  claude: { brand: 'anthropic', label: 'Anthropic' },
  anthropic: { brand: 'anthropic', label: 'Anthropic' },
  codex: { brand: 'openai', label: 'OpenAI' },
  openai: { brand: 'openai', label: 'OpenAI' },
  pi: { brand: 'pi', label: 'Pi' },
  'pi agent': { brand: 'pi', label: 'Pi' },
  cursor: { brand: 'cursor', label: 'Cursor' },
  anysphere: { brand: 'cursor', label: 'Cursor' },
  antigravity: { brand: 'google', label: 'Google' },
  google: { brand: 'google', label: 'Google' },
  gemini: { brand: 'google', label: 'Google' },
  openrouter: { brand: 'openrouter', label: 'OpenRouter' },
}

export function resolveProviderIcon(
  providerId?: string | null,
  vendorLabel?: string | null,
  name?: string | null,
): { brand: ProviderBrand | null; label: string; initials: string } {
  // Provider identity wins over a model vendor or descriptive text. An
  // unknown ID must not borrow a familiar brand through substring matching.
  const identity = (providerId || vendorLabel || name || '')
    .trim()
    .toLowerCase()
  const known = Object.hasOwn(BRANDS, identity) ? BRANDS[identity] : undefined
  const label =
    known?.label ?? (vendorLabel || name || providerId || 'Unknown provider')
  const words = label
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const initials =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
          .toUpperCase()
      : words[0]?.slice(0, 2).toUpperCase() || '?'
  return { brand: known?.brand ?? null, label, initials }
}
