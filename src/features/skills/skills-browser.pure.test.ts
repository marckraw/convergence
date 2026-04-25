import { describe, expect, it } from 'vitest'
import {
  findSkillInGroups,
  filterSkillCatalog,
  firstSkillInGroups,
  getNativeSkillInvocationText,
  hasMcpDependencies,
  type SkillBrowserFilters,
} from './skills-browser.pure'
import type { ProjectSkillCatalog, SkillCatalogEntry } from '@/entities/skill'

const baseFilters: SkillBrowserFilters = {
  query: '',
  providerId: 'all',
  scope: 'all',
  enabled: 'all',
  warnings: 'all',
  dependencyState: 'all',
}

function skill(
  id: string,
  overrides: Partial<SkillCatalogEntry> = {},
): SkillCatalogEntry {
  return {
    id,
    providerId: 'codex',
    providerName: 'Codex',
    name: id,
    displayName: id,
    description: `${id} description`,
    shortDescription: null,
    path: `/tmp/${id}/SKILL.md`,
    scope: 'user',
    rawScope: 'user',
    sourceLabel: 'User',
    enabled: true,
    dependencies: [],
    warnings: [],
    ...overrides,
  }
}

function catalog(): ProjectSkillCatalog {
  return {
    projectId: 'project-1',
    projectName: 'convergence',
    refreshedAt: '2026-04-25T00:00:00.000Z',
    providers: [
      {
        providerId: 'codex',
        providerName: 'Codex',
        catalogSource: 'native-rpc',
        invocationSupport: 'structured-input',
        activationConfirmation: 'none',
        error: null,
        skills: [
          skill('review', { description: 'Review pull requests.' }),
          skill('ship-it', {
            scope: 'project',
            rawScope: 'repo',
            sourceLabel: 'Project',
            enabled: false,
            dependencies: [
              {
                kind: 'mcp',
                name: 'github',
                state: 'needs-auth',
              },
            ],
            warnings: [
              {
                code: 'disabled',
                message: 'This skill is disabled.',
              },
            ],
          }),
        ],
      },
      {
        providerId: 'pi',
        providerName: 'Pi',
        catalogSource: 'unsupported',
        invocationSupport: 'unsupported',
        activationConfirmation: 'none',
        error: 'Pi discovery is unavailable.',
        skills: [],
      },
    ],
  }
}

describe('filterSkillCatalog', () => {
  it('matches query against description, provider, scope, and path', () => {
    expect(
      filterSkillCatalog(catalog(), {
        ...baseFilters,
        query: 'pull requests',
      })[0].skills.map((entry) => entry.name),
    ).toEqual(['review'])

    expect(
      filterSkillCatalog(catalog(), {
        ...baseFilters,
        query: '/tmp/ship-it',
      })[0].skills.map((entry) => entry.name),
    ).toEqual(['ship-it'])
  })

  it('filters by provider, scope, enabled state, and warnings', () => {
    expect(
      filterSkillCatalog(catalog(), {
        ...baseFilters,
        providerId: 'codex',
        scope: 'project',
        enabled: 'disabled',
        warnings: 'warnings',
      })[0].skills.map((entry) => entry.name),
    ).toEqual(['ship-it'])
  })

  it('matches and filters by dependency metadata', () => {
    expect(
      filterSkillCatalog(catalog(), {
        ...baseFilters,
        query: 'github',
      })[0].skills.map((entry) => entry.name),
    ).toEqual(['ship-it'])

    expect(
      filterSkillCatalog(catalog(), {
        ...baseFilters,
        dependencyState: 'needs-auth',
      })[0].skills.map((entry) => entry.name),
    ).toEqual(['ship-it'])
  })

  it('keeps provider error groups visible', () => {
    const groups = filterSkillCatalog(catalog(), {
      ...baseFilters,
      providerId: 'pi',
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      providerId: 'pi',
      error: 'Pi discovery is unavailable.',
      skills: [],
    })
  })

  it('finds the selected skill inside filtered groups', () => {
    const groups = filterSkillCatalog(catalog(), baseFilters)

    expect(findSkillInGroups(groups, 'ship-it')?.name).toBe('ship-it')
    expect(findSkillInGroups(groups, 'missing')).toBeNull()
    expect(findSkillInGroups(groups, null)).toBeNull()
  })

  it('returns the first available skill from provider groups', () => {
    const groups = filterSkillCatalog(catalog(), baseFilters)

    expect(firstSkillInGroups(groups)?.name).toBe('review')
    expect(firstSkillInGroups([])).toBeNull()
  })

  it('derives dependency and native invocation helpers', () => {
    const codexSkill = skill('review')
    const piSkill = skill('pi-review', {
      providerId: 'pi',
      dependencies: [{ kind: 'mcp', name: 'github', state: 'declared' }],
    })

    expect(hasMcpDependencies(codexSkill)).toBe(false)
    expect(hasMcpDependencies(piSkill)).toBe(true)
    expect(getNativeSkillInvocationText(codexSkill)).toBe('$review')
    expect(
      getNativeSkillInvocationText({ ...codexSkill, providerId: 'pi' }),
    ).toBe('/skill:review')
    expect(
      getNativeSkillInvocationText({
        ...codexSkill,
        providerId: 'claude-code',
      }),
    ).toBe('/review')
  })
})
