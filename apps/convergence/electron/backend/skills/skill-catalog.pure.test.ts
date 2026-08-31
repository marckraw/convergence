import { describe, expect, it } from 'vitest'
import {
  addDuplicateNameWarnings,
  buildSkillCatalogId,
  normalizeSkillScope,
} from './skill-catalog.pure'
import type { SkillCatalogEntry } from './skills.types'

function entry(name: string, path: string): SkillCatalogEntry {
  return {
    id: buildSkillCatalogId({
      providerId: 'codex',
      name,
      path,
      scope: 'user',
      rawScope: 'user',
    }),
    providerId: 'codex',
    providerName: 'Codex',
    name,
    path,
    scope: 'user',
    rawScope: 'user',
    displayName: name,
    description: `${name} description`,
    shortDescription: null,
    sourceLabel: 'User',
    enabled: true,
    dependencies: [],
    warnings: [],
  }
}

describe('normalizeSkillScope', () => {
  it('maps known Codex scopes', () => {
    expect(normalizeSkillScope('repo')).toMatchObject({
      scope: 'project',
      sourceLabel: 'Project',
      warning: null,
    })
    expect(normalizeSkillScope('system')).toMatchObject({
      scope: 'system',
      sourceLabel: 'System',
      warning: null,
    })
  })

  it('flags unknown scopes', () => {
    expect(normalizeSkillScope('workspace')).toMatchObject({
      scope: 'unknown',
      sourceLabel: 'Unknown',
      warning: expect.objectContaining({ code: 'unknown-scope' }),
    })
  })
})

describe('buildSkillCatalogId', () => {
  it('is stable for the same identity', () => {
    const input = {
      providerId: 'codex' as const,
      name: 'skill-creator',
      path: '/tmp/skills/skill-creator/SKILL.md',
      scope: 'user' as const,
      rawScope: 'user',
    }

    expect(buildSkillCatalogId(input)).toBe(buildSkillCatalogId(input))
  })

  it('differs by provider and path', () => {
    const base = {
      name: 'skill-creator',
      scope: 'user' as const,
      rawScope: 'user',
    }

    expect(
      buildSkillCatalogId({
        ...base,
        providerId: 'codex',
        path: '/tmp/skills/a/SKILL.md',
      }),
    ).not.toBe(
      buildSkillCatalogId({
        ...base,
        providerId: 'codex',
        path: '/tmp/skills/b/SKILL.md',
      }),
    )

    expect(
      buildSkillCatalogId({
        ...base,
        providerId: 'codex',
        path: '/tmp/skills/a/SKILL.md',
      }),
    ).not.toBe(
      buildSkillCatalogId({
        ...base,
        providerId: 'pi',
        path: '/tmp/skills/a/SKILL.md',
      }),
    )
  })
})

describe('addDuplicateNameWarnings', () => {
  it('adds duplicate-name warnings to every duplicate entry', () => {
    const entries = [
      entry('ship-it', '/tmp/user/ship-it/SKILL.md'),
      entry('other', '/tmp/user/other/SKILL.md'),
      entry('ship-it', '/tmp/project/ship-it/SKILL.md'),
    ]

    const out = addDuplicateNameWarnings(entries)

    expect(out[0].warnings).toEqual([
      expect.objectContaining({ code: 'duplicate-name' }),
    ])
    expect(out[1].warnings).toEqual([])
    expect(out[2].warnings).toEqual([
      expect.objectContaining({ code: 'duplicate-name' }),
    ])
  })
})
