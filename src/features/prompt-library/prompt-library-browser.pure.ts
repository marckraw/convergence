import type {
  PromptLibraryCatalog,
  PromptLibraryEntry,
  PromptLibraryScope,
} from '@/entities/prompt-library'

export type PromptLibraryScopeFilter = PromptLibraryScope | 'all'
export type PromptLibraryKindFilter = PromptLibraryEntry['kind'] | 'all'

export interface PromptLibraryBrowserFilters {
  query: string
  scope: PromptLibraryScopeFilter
  kind: PromptLibraryKindFilter
  tag: string
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function matchesQuery(prompt: PromptLibraryEntry, query: string): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) {
    return true
  }

  const haystack = [
    prompt.title,
    prompt.description,
    prompt.shortDescription,
    prompt.relativePath,
    prompt.path,
    prompt.scope,
    prompt.sourceLabel,
    prompt.kind,
    ...prompt.tags,
  ]
    .map(normalize)
    .join(' ')

  return haystack.includes(normalizedQuery)
}

export function filterPromptLibraryCatalog(
  catalog: PromptLibraryCatalog | null,
  filters: PromptLibraryBrowserFilters,
): PromptLibraryEntry[] {
  if (!catalog) {
    return []
  }

  return catalog.prompts.filter((prompt) => {
    if (filters.scope !== 'all' && prompt.scope !== filters.scope) {
      return false
    }
    if (filters.kind !== 'all' && prompt.kind !== filters.kind) {
      return false
    }
    if (filters.tag !== 'all' && !prompt.tags.includes(filters.tag)) {
      return false
    }
    return matchesQuery(prompt, filters.query)
  })
}

export function findPrompt(
  prompts: PromptLibraryEntry[],
  promptId: string | null,
): PromptLibraryEntry | null {
  if (!promptId) {
    return null
  }
  return prompts.find((prompt) => prompt.id === promptId) ?? null
}

export function firstPrompt(
  prompts: PromptLibraryEntry[],
): PromptLibraryEntry | null {
  return prompts[0] ?? null
}

export function collectPromptTags(
  catalog: PromptLibraryCatalog | null,
): string[] {
  const tags = new Set<string>()
  for (const prompt of catalog?.prompts ?? []) {
    for (const tag of prompt.tags) {
      tags.add(tag)
    }
  }
  return Array.from(tags).sort((left, right) => left.localeCompare(right))
}
