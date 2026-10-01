/** What the search matches on an item: its words, and a group heading is not one. */
type Searchable = {
  label: string
  description?: string
  badge?: { label: string }
  group?: string
}

/**
 * The items a search keeps, in their order: those whose label, description or
 * badge holds the query, ignoring case and the spaces round it. An empty
 * query keeps them all.
 */
export function filterComboboxItems<Item extends Searchable>(
  items: readonly Item[],
  query: string,
): Item[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...items]
  return items.filter((item) =>
    [item.label, item.description, item.badge?.label].some(
      (words) => words !== undefined && words.toLowerCase().includes(needle),
    ),
  )
}

/** A run of items under one heading; `label` is null for items with none. */
export type ComboboxGroupRun<Item> = { label: string | null; items: Item[] }

/**
 * The items cut into runs by their group, in order: each run is the items
 * next to each other that share one heading. Items without a group make runs
 * of their own, with no heading.
 */
export function groupComboboxItems<Item extends Searchable>(
  items: readonly Item[],
): ComboboxGroupRun<Item>[] {
  const runs: ComboboxGroupRun<Item>[] = []
  for (const item of items) {
    const label = item.group ?? null
    const last = runs.at(-1)
    if (last && last.label === label) last.items.push(item)
    else runs.push({ label, items: [item] })
  }
  return runs
}
