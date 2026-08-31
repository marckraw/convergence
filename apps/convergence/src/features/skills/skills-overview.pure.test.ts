import { describe, expect, it } from 'vitest'
import type { ProjectSkillCatalog, SkillCatalogEntry } from '@/entities/skill'
import { buildSkillsOverview } from './skills-overview.pure'

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
        providerId: 'claude-code',
        providerName: 'Claude Code',
        catalogSource: 'filesystem',
        invocationSupport: 'native-command',
        activationConfirmation: 'native-event',
        error: null,
        skills: [
          skill('global-a'),
          skill('project-a', { scope: 'project', rawScope: 'project' }),
          skill('plugin-a', { scope: 'plugin', rawScope: 'plugin' }),
          skill('disabled-dup', {
            scope: 'user',
            enabled: false,
            warnings: [
              { code: 'duplicate-name', message: 'duplicate' },
              { code: 'missing-description', message: 'no description' },
            ],
            dependencies: [{ kind: 'mcp', name: 'gh', state: 'needs-auth' }],
          }),
          skill('needs-install', {
            scope: 'project',
            rawScope: 'project',
            dependencies: [{ kind: 'mcp', name: 'db', state: 'needs-install' }],
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

describe('buildSkillsOverview', () => {
  it('returns an empty overview for a null catalog', () => {
    const overview = buildSkillsOverview(null)
    expect(overview.total).toBe(0)
    expect(overview.byOrigin).toEqual([])
    expect(overview.byProvider).toEqual([])
  })

  it('aggregates totals, origins, providers, and attention buckets', () => {
    const overview = buildSkillsOverview(catalog())

    expect(overview.total).toBe(5)
    expect(overview.enabled).toBe(4)
    expect(overview.disabled).toBe(1)
    expect(overview.withWarnings).toBe(1)
    expect(overview.depsNeedingAction).toBe(2)

    expect(overview.byOrigin).toEqual([
      { origin: 'project', count: 2, enabled: 2, withWarnings: 0 },
      { origin: 'global', count: 2, enabled: 1, withWarnings: 1 },
      { origin: 'plugin', count: 1, enabled: 1, withWarnings: 0 },
    ])

    expect(overview.byProvider).toEqual([
      {
        providerId: 'claude-code',
        providerName: 'Claude Code',
        count: 5,
        errored: false,
        error: null,
      },
      {
        providerId: 'pi',
        providerName: 'Pi',
        count: 0,
        errored: true,
        error: 'Pi discovery is unavailable.',
      },
    ])

    expect(overview.attention).toEqual({
      duplicates: 1,
      missingDescription: 1,
      invalidFrontmatter: 0,
      unsupportedInvocation: 0,
      needsInstall: 1,
      needsAuth: 1,
      disabled: 1,
    })
  })
})
