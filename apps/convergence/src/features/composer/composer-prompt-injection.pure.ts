import type {
  PromptLibraryCatalog,
  PromptLibraryEntry,
} from '@/entities/prompt-library'

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function matchesQuery(prompt: PromptLibraryEntry, query: string): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return true

  return [
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
    .includes(normalizedQuery)
}

export function filterComposerPrompts(input: {
  catalog: PromptLibraryCatalog | null
  query: string
}): PromptLibraryEntry[] {
  if (!input.catalog) return []

  return input.catalog.prompts
    .filter((prompt) => matchesQuery(prompt, input.query))
    .sort((left, right) => {
      if (left.scope !== right.scope) {
        return left.scope === 'project' ? -1 : 1
      }
      return left.title.localeCompare(right.title)
    })
}
