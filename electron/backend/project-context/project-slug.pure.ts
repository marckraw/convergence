const FALLBACK_SLUG = 'convergence'
const MAX_LENGTH = 64
const LEADING_DIGIT_PREFIX = 'p-'

function trimDashes(value: string): string {
  return value.replace(/^-+|-+$/g, '')
}

export function projectNameToSlug(name: string): string {
  const lowered = name.toLowerCase()
  const collapsed = lowered.replace(/[^a-z0-9]+/g, '-')
  const trimmed = trimDashes(collapsed)
  if (trimmed.length === 0) return FALLBACK_SLUG

  const capped = trimDashes(trimmed.slice(0, MAX_LENGTH))
  if (capped.length === 0) return FALLBACK_SLUG

  if (/^[0-9]/.test(capped)) {
    const prefixed = LEADING_DIGIT_PREFIX + capped
    return trimDashes(prefixed.slice(0, MAX_LENGTH))
  }

  return capped
}
