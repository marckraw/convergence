export function normalizeRequiredText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }
  return trimmed
}

export function normalizeOptionalText(value: string | undefined): string {
  return value?.trim() ?? ''
}
