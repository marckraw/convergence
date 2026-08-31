import { describe, expect, it } from 'vitest'
import {
  hasSkillSelection,
  skillSelectionFromCatalogEntry,
} from './skill-selection.pure'
import type { SkillCatalogEntry } from './skill.types'

const entry: SkillCatalogEntry = {
  id: 'skill:codex:1',
  providerId: 'codex',
  providerName: 'Codex',
  name: 'review',
  displayName: 'Review',
  description: 'Review pull requests.',
  shortDescription: 'Review PRs',
  path: '/tmp/review/SKILL.md',
  scope: 'user',
  rawScope: 'user',
  sourceLabel: 'User',
  enabled: true,
  dependencies: [],
  warnings: [],
}

describe('skillSelectionFromCatalogEntry', () => {
  it('keeps the catalog identity and marks the selection as selected', () => {
    expect(skillSelectionFromCatalogEntry(entry)).toEqual({
      id: 'skill:codex:1',
      providerId: 'codex',
      providerName: 'Codex',
      name: 'review',
      displayName: 'Review',
      path: '/tmp/review/SKILL.md',
      scope: 'user',
      rawScope: 'user',
      sourceLabel: 'User',
      status: 'selected',
    })
  })

  it('allows later phases to write a different status', () => {
    expect(skillSelectionFromCatalogEntry(entry, 'sent')).toMatchObject({
      status: 'sent',
    })
  })
})

describe('hasSkillSelection', () => {
  it('checks by stable skill id', () => {
    const selection = skillSelectionFromCatalogEntry(entry)

    expect(hasSkillSelection([selection], 'skill:codex:1')).toBe(true)
    expect(hasSkillSelection([selection], 'skill:codex:2')).toBe(false)
  })
})
