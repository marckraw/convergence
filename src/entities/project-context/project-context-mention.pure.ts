export interface MentionableItem {
  id: string
  label: string | null
}

const UNTITLED_LABEL = 'untitled'

function labelForFilter(item: MentionableItem): string {
  const trimmed = item.label?.trim()
  return trimmed && trimmed.length > 0 ? trimmed.toLowerCase() : UNTITLED_LABEL
}

export function filterContextMentions<T extends MentionableItem>(
  items: T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) {
    return [...items].sort((a, b) =>
      labelForFilter(a).localeCompare(labelForFilter(b)),
    )
  }
  return items
    .filter((item) => labelForFilter(item).includes(normalized))
    .sort((a, b) => {
      const aLabel = labelForFilter(a)
      const bLabel = labelForFilter(b)
      const aStarts = aLabel.startsWith(normalized)
      const bStarts = bLabel.startsWith(normalized)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return aLabel.localeCompare(bLabel)
    })
}
