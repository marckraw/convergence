function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = record[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function readConfigString(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
  key: string,
): string | null {
  return readString(primary, key) ?? readString(secondary, key)
}

export function readConfigStringArray(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
  key: string,
): string[] {
  const first = readStringArray(primary, key)
  return first.length > 0 ? first : readStringArray(secondary, key)
}

export function requireConfigString(
  sourceName: string,
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
  key: string,
): string {
  const value = readConfigString(primary, secondary, key)
  if (!value) {
    throw new Error(
      `${sourceName} is missing required Workboard config: ${key}`,
    )
  }
  return value
}
