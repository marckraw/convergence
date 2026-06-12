export function getExecutionHostRemoteBaseUrlError(
  value: string,
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return null
    }
  } catch {
    return 'Remote execution host base URL must be a valid HTTP(S) URL.'
  }

  return 'Remote execution host base URL must be a valid HTTP(S) URL.'
}
