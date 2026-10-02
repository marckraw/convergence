import type { ProjectSkillCatalog, SkillCatalogEntry } from './skill.types'

/**
 * What every skill list says when it has no rows to show (CONV-10): the Add
 * popover, the `::skill::` picker and the Actions list read this one map, so a
 * skill list reads alike wherever it is open (R10).
 *
 * `empty` is the provider having none; `noMatch` is a search hiding them all.
 */
export const SKILL_LIST_COPY = {
  loading: 'Loading skills…',
  failed: 'Couldn’t load skills',
  empty: 'No skills available for this agent',
  noMatch: 'No matching skills',
} as const

/**
 * Where a skill list is: loading, failed (with why), empty for this agent,
 * empty for this search, or listing rows.
 */
export type SkillListState =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'empty' }
  | { kind: 'no-match' }
  | { kind: 'listed' }

/**
 * A composer list's state (the Add popover, the `::skill::` picker), from what
 * the composer holds: the catalog's failure, whether it is loading, the rows
 * its search left, and the search.
 *
 * A failure outranks loading, and loading outranks an empty list, so a failed
 * or unfinished scan never reads as "none". With no search, an empty list is
 * the agent having none; with one, it is the search matching none.
 */
export function composerSkillListState(input: {
  error: string | null
  isLoading: boolean
  count: number
  query: string
}): SkillListState {
  if (input.error) return { kind: 'failed', message: input.error }
  if (input.isLoading) return { kind: 'loading' }
  if (input.count > 0) return { kind: 'listed' }
  return input.query.trim() ? { kind: 'no-match' } : { kind: 'empty' }
}

/**
 * Loading, failure and empty told apart for THIS agent's provider (R3), as
 * the Actions list reads the store.
 *
 * Failure outranks everything, because a failed scan must never read as
 * "no skills". A catalog read for another project or chat is not this one's
 * answer, and reads as still loading.
 */
export function resolveSkillListState(input: {
  catalog: ProjectSkillCatalog | null
  catalogId: string
  isCatalogLoading: boolean
  loadingProviderIds: readonly string[]
  catalogError: string | null
  failedProviders: Readonly<Record<string, string>>
  providerId: string
}): SkillListState {
  const failed = input.failedProviders[input.providerId]
  if (failed !== undefined) return { kind: 'failed', message: failed }
  if (input.catalogError !== null) {
    return { kind: 'failed', message: input.catalogError }
  }
  const catalog =
    input.catalog && input.catalog.projectId === input.catalogId
      ? input.catalog
      : null
  const provider = catalog?.providers.find(
    (candidate) => candidate.providerId === input.providerId,
  )
  if (provider?.error && provider.skills.length === 0) {
    return { kind: 'failed', message: provider.error }
  }
  if (provider && provider.skills.length > 0) return { kind: 'listed' }
  if (
    !catalog ||
    input.loadingProviderIds.includes(input.providerId) ||
    (input.isCatalogLoading && input.loadingProviderIds.length === 0)
  ) {
    return { kind: 'loading' }
  }
  return { kind: 'empty' }
}

/** A skill's line under its name: its short description, else its description. */
export function skillRowDescription(
  skill: Pick<SkillCatalogEntry, 'shortDescription' | 'description'>,
): string {
  return skill.shortDescription || skill.description || 'No description.'
}
