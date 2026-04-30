export interface MentionTriggerRange {
  start: number
  end: number
}

export type MentionTrigger =
  | { open: true; query: string; range: MentionTriggerRange }
  | { open: false }

export interface MentionableItem {
  id: string
  label: string | null
}

const TRIGGER = '::'
const UNTITLED_LABEL = 'untitled'

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch)
}

export function detectMentionTrigger(
  text: string,
  cursor: number,
): MentionTrigger {
  if (cursor < TRIGGER.length) return { open: false }

  let queryStart = cursor
  while (queryStart > 0) {
    const ch = text[queryStart - 1]
    if (ch === ':') break
    if (isWhitespace(ch)) return { open: false }
    queryStart--
  }

  if (queryStart < TRIGGER.length) return { open: false }
  if (text[queryStart - 1] !== ':' || text[queryStart - 2] !== ':') {
    return { open: false }
  }

  if (queryStart >= 3 && text[queryStart - 3] === ':') {
    return { open: false }
  }

  if (queryStart - TRIGGER.length > 0) {
    const before = text[queryStart - TRIGGER.length - 1]
    if (before !== undefined && !isWhitespace(before)) {
      return { open: false }
    }
  }

  return {
    open: true,
    query: text.slice(queryStart, cursor),
    range: { start: queryStart - TRIGGER.length, end: cursor },
  }
}

export function applyMentionExpansion(
  text: string,
  range: MentionTriggerRange,
  body: string,
): { text: string; cursor: number } {
  const before = text.slice(0, range.start)
  const after = text.slice(range.end)
  return {
    text: `${before}${body}${after}`,
    cursor: range.start + body.length,
  }
}

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
