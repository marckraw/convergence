export function normalizeProjectContextBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) {
    throw new Error('Project context item body cannot be empty')
  }
  return trimmed
}

export function normalizeProjectContextLabel(
  label: string | null | undefined,
): string | null {
  if (label === undefined || label === null) return null
  const trimmed = label.trim()
  return trimmed.length === 0 ? null : trimmed
}
