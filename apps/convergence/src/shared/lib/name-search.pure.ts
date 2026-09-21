/**
 * Shared conversation-name search. One needle, substring match, no tokens and
 * no ranking — callers filter lists in place so on-screen order never changes.
 */
export function normalizeNameQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

export function nameMatches(
  name: string | null | undefined,
  query: string,
): boolean {
  const needle = normalizeNameQuery(query)
  if (needle.length === 0) return true
  if (name == null || name.length === 0) return false
  return name.toLowerCase().includes(needle)
}

export function filterByNameSearch<T extends { name?: string | null }>(
  items: readonly T[],
  query: string,
): T[] {
  return items.filter((item) => nameMatches(item.name, query))
}

/**
 * Narrow both sidebar session lists together. The root must call this once so
 * Activity and the project tree always describe the same searched set (R2/R7).
 */
export function narrowSidebarSessionLists<T extends { name?: string | null }>(
  globalSessions: readonly T[],
  sessions: readonly T[],
  query: string,
): { globalSessions: T[]; sessions: T[] } {
  return {
    globalSessions: filterByNameSearch(globalSessions, query),
    sessions: filterByNameSearch(sessions, query),
  }
}

export function noConversationMatchesLine(query: string): string {
  return `No conversation matches "${query}"`
}
