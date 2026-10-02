import { describe, expect, it } from 'vitest'
import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogEntry,
} from './skill.types'
import {
  composerSkillListState,
  resolveSkillListState,
  SKILL_LIST_COPY,
  skillRowDescription,
} from './skill-list.pure'

function skill(
  id: string,
  overrides: Partial<SkillCatalogEntry> = {},
): SkillCatalogEntry {
  return {
    id,
    providerId: 'claude-code',
    providerName: 'Claude Code',
    name: id,
    displayName: id,
    description: `${id} description`,
    shortDescription: null,
    path: `/skills/${id}/SKILL.md`,
    scope: 'global',
    rawScope: null,
    sourceLabel: 'Global',
    enabled: true,
    dependencies: [],
    warnings: [],
    ...overrides,
  }
}

function provider(
  skills: SkillCatalogEntry[],
  overrides: Partial<ProviderSkillCatalog> = {},
): ProviderSkillCatalog {
  return {
    providerId: 'claude-code',
    providerName: 'Claude Code',
    catalogSource: 'filesystem',
    invocationSupport: 'native-command',
    activationConfirmation: 'none',
    skills,
    error: null,
    ...overrides,
  }
}

function catalog(
  providers: ProviderSkillCatalog[],
  projectId = 'project-1',
): ProjectSkillCatalog {
  return { projectId, projectName: 'Project', providers, refreshedAt: '' }
}

describe('SKILL_LIST_COPY (CONV-10)', () => {
  it('says each state in R10’s words, the ellipsis character included', () => {
    expect(SKILL_LIST_COPY).toEqual({
      loading: 'Loading skills…',
      failed: "Couldn't load skills",
      empty: 'No skills available for this agent',
      noMatch: 'No matching skills',
    })
  })
})

describe('composerSkillListState (CONV-10)', () => {
  const base = { error: null, isLoading: false, count: 0, query: '' }

  it('is a failure first, with the store’s own message, even while loading', () => {
    expect(
      composerSkillListState({
        ...base,
        error: 'EACCES: skills dir',
        isLoading: true,
        count: 2,
      }),
    ).toEqual({ kind: 'failed', message: 'EACCES: skills dir' })
  })

  it('is loading before it is empty or listed', () => {
    expect(
      composerSkillListState({ ...base, isLoading: true, count: 3 }),
    ).toEqual({ kind: 'loading' })
  })

  it('is listed when its search left rows', () => {
    expect(composerSkillListState({ ...base, count: 1, query: 'td' })).toEqual({
      kind: 'listed',
    })
  })

  it('tells "none for this agent" from "none for this search"', () => {
    expect(composerSkillListState({ ...base, query: '  ' })).toEqual({
      kind: 'empty',
    })
    expect(composerSkillListState({ ...base, query: 'lint' })).toEqual({
      kind: 'no-match',
    })
  })
})

describe('resolveSkillListState (R3)', () => {
  const base = {
    catalogId: 'project-1',
    isCatalogLoading: false,
    loadingProviderIds: [] as string[],
    catalogError: null,
    failedProviders: {},
    providerId: 'claude-code',
  }

  it('is loading while this agent’s provider has not arrived', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([]),
        isCatalogLoading: true,
        loadingProviderIds: ['claude-code'],
      }),
    ).toEqual({ kind: 'loading' })
    expect(
      resolveSkillListState({ ...base, catalog: null, isCatalogLoading: true }),
    ).toEqual({ kind: 'loading' })
  })

  it('reads a catalog of another project or chat as not yet this one’s', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([skill('a')])], 'project-2'),
      }),
    ).toEqual({ kind: 'loading' })
  })

  it('is a failure, never empty, when this provider’s scan failed', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([]),
        failedProviders: { 'claude-code': 'EACCES: skills dir' },
      }),
    ).toEqual({ kind: 'failed', message: 'EACCES: skills dir' })
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([], { error: 'Codex app-server exited' })]),
      }),
    ).toEqual({ kind: 'failed', message: 'Codex app-server exited' })
    expect(
      resolveSkillListState({
        ...base,
        catalog: null,
        catalogError: 'Failed to load skills',
      }),
    ).toEqual({ kind: 'failed', message: 'Failed to load skills' })
  })

  it('is empty only when the scan succeeded with none', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([skill('a')], { providerId: 'codex' })]),
      }),
    ).toEqual({ kind: 'empty' })
  })

  it('is listed when this provider has skills', () => {
    expect(
      resolveSkillListState({
        ...base,
        catalog: catalog([provider([skill('a')])]),
      }),
    ).toEqual({ kind: 'listed' })
  })
})

describe('skillRowDescription (CONV-10)', () => {
  it('reads the short description, then the description, then says there is none', () => {
    expect(
      skillRowDescription({ shortDescription: 'Short', description: 'Long' }),
    ).toBe('Short')
    expect(
      skillRowDescription({ shortDescription: null, description: 'Long' }),
    ).toBe('Long')
    expect(skillRowDescription({ shortDescription: '', description: '' })).toBe(
      'No description.',
    )
  })
})
