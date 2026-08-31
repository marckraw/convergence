import { describe, expect, it } from 'vitest'
import { buildSkillCatalogId } from './skill-catalog.pure'
import {
  failedCodexSkillInvocation,
  markSkillSelectionsStatus,
  resolveCodexSkillInvocation,
} from './codex-skill-invocation.pure'
import type {
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillSelection,
} from './skills.types'

function skill(overrides: Partial<SkillCatalogEntry> = {}): SkillCatalogEntry {
  const path = overrides.path ?? '/skills/planning/SKILL.md'
  const name = overrides.name ?? 'planning'
  const scope = overrides.scope ?? 'global'
  const rawScope = overrides.rawScope ?? 'global'
  const id =
    overrides.id ??
    buildSkillCatalogId({
      providerId: 'codex',
      name,
      path,
      scope,
      rawScope,
    })

  return {
    id,
    providerId: 'codex',
    providerName: 'Codex',
    name,
    path,
    scope,
    rawScope,
    displayName: overrides.displayName ?? 'Planning',
    description: 'Plan implementation work.',
    shortDescription: 'Plan implementation work.',
    sourceLabel: 'Global',
    enabled: true,
    dependencies: [],
    warnings: [],
    ...overrides,
  }
}

function catalog(skills: SkillCatalogEntry[]): ProviderSkillCatalog {
  return {
    providerId: 'codex',
    providerName: 'Codex',
    catalogSource: 'native-rpc',
    invocationSupport: 'structured-input',
    activationConfirmation: 'none',
    skills,
    error: null,
  }
}

function selection(entry: SkillCatalogEntry): SkillSelection {
  return {
    id: entry.id,
    providerId: entry.providerId,
    providerName: entry.providerName,
    name: entry.name,
    displayName: entry.displayName,
    path: '/untrusted/renderer/path/SKILL.md',
    scope: entry.scope,
    rawScope: entry.rawScope,
    sourceLabel: entry.sourceLabel,
    status: 'selected',
  }
}

describe('resolveCodexSkillInvocation', () => {
  it('uses catalog paths for structured Codex skill input', () => {
    const entry = skill()
    const result = resolveCodexSkillInvocation({
      catalog: catalog([entry]),
      selections: [selection(entry)],
    })

    expect(result).toEqual({
      ok: true,
      skillInputs: [
        {
          name: 'planning',
          path: '/skills/planning/SKILL.md',
        },
      ],
      skillSelections: [
        expect.objectContaining({
          id: entry.id,
          path: '/skills/planning/SKILL.md',
          status: 'selected',
        }),
      ],
    })
  })

  it('marks stale selected skills as unavailable', () => {
    const entry = skill()
    const result = resolveCodexSkillInvocation({
      catalog: catalog([]),
      selections: [selection(entry)],
    })

    expect(result).toMatchObject({
      ok: false,
      status: 'unavailable',
      skillSelections: [
        {
          id: entry.id,
          status: 'unavailable',
        },
      ],
    })
  })

  it('marks disabled or pathless selected skills as unavailable', () => {
    const disabled = skill({ enabled: false })
    const pathless = skill({
      id: 'pathless',
      name: 'pathless',
      path: null,
      displayName: 'Pathless',
    })

    expect(
      resolveCodexSkillInvocation({
        catalog: catalog([disabled]),
        selections: [selection(disabled)],
      }),
    ).toMatchObject({ ok: false, status: 'unavailable' })

    expect(
      resolveCodexSkillInvocation({
        catalog: catalog([pathless]),
        selections: [selection(pathless)],
      }),
    ).toMatchObject({ ok: false, status: 'unavailable' })
  })
})

describe('markSkillSelectionsStatus', () => {
  it('updates status while preserving refs', () => {
    const entry = skill()

    expect(markSkillSelectionsStatus([selection(entry)], 'sent')).toEqual([
      expect.objectContaining({
        id: entry.id,
        status: 'sent',
      }),
    ])
  })
})

describe('failedCodexSkillInvocation', () => {
  it('marks selections failed when catalog validation throws', () => {
    const entry = skill()
    const result = failedCodexSkillInvocation(
      [selection(entry)],
      new Error('skills/list unavailable'),
    )

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      message: 'skills/list unavailable',
      skillSelections: [{ id: entry.id, status: 'failed' }],
    })
  })
})
