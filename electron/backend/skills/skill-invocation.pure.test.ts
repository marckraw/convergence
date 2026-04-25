import { describe, expect, it } from 'vitest'
import {
  markSkillSelectionsStatus,
  selectionFromCatalogEntry,
  uniqueSkillSelections,
} from './skill-invocation.pure'
import type { SkillCatalogEntry, SkillSelection } from './skills.types'

function entry(): SkillCatalogEntry {
  return {
    id: 'skill:codex:planning',
    providerId: 'codex',
    providerName: 'Codex',
    name: 'planning',
    path: '/skills/planning/SKILL.md',
    scope: 'global',
    rawScope: 'global',
    displayName: 'Planning',
    description: 'Plan work.',
    shortDescription: 'Plan work.',
    sourceLabel: 'Global',
    enabled: true,
    dependencies: [],
    warnings: [],
  }
}

function selection(id: string): SkillSelection {
  return {
    id,
    providerId: 'codex',
    providerName: 'Codex',
    name: 'planning',
    displayName: 'Planning',
    path: '/skills/planning/SKILL.md',
    scope: 'global',
    rawScope: 'global',
    sourceLabel: 'Global',
    status: 'selected',
  }
}

describe('skill invocation helpers', () => {
  it('creates a selection from a catalog entry', () => {
    expect(selectionFromCatalogEntry(entry(), 'sent', 'arg')).toEqual({
      ...selection('skill:codex:planning'),
      status: 'sent',
      argumentText: 'arg',
    })
  })

  it('marks selected skills with a new status', () => {
    expect(markSkillSelectionsStatus([selection('a')], 'failed')).toEqual([
      expect.objectContaining({
        id: 'a',
        status: 'failed',
      }),
    ])
  })

  it('deduplicates selections by stable id', () => {
    expect(
      uniqueSkillSelections([
        selection('a'),
        selection('b'),
        selection('a'),
      ]).map((item) => item.id),
    ).toEqual(['a', 'b'])
  })
})
