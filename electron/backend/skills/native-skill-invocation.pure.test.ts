import { describe, expect, it } from 'vitest'
import { buildSkillCatalogId } from './skill-catalog.pure'
import {
  buildNativeSkillPrompt,
  failedNativeSkillInvocation,
  resolveNativeSkillInvocation,
} from './native-skill-invocation.pure'
import type {
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillProviderId,
  SkillSelection,
} from './skills.types'

function skill(
  overrides: Partial<SkillCatalogEntry> = {},
  providerId: SkillProviderId = 'claude-code',
): SkillCatalogEntry {
  const path = overrides.path ?? '/skills/planning/SKILL.md'
  const name = overrides.name ?? 'planning'
  const scope = overrides.scope ?? 'project'
  const rawScope = overrides.rawScope ?? 'project'
  const id =
    overrides.id ??
    buildSkillCatalogId({
      providerId,
      name,
      path,
      scope,
      rawScope,
    })

  return {
    id,
    providerId,
    providerName: providerId === 'pi' ? 'Pi Agent' : 'Claude Code',
    name,
    path,
    scope,
    rawScope,
    displayName: overrides.displayName ?? name,
    description: 'Plan implementation work.',
    shortDescription: 'Plan implementation work.',
    sourceLabel: 'Project',
    enabled: true,
    dependencies: [],
    warnings: [],
    ...overrides,
  }
}

function catalog(
  skills: SkillCatalogEntry[],
  providerId: SkillProviderId = 'claude-code',
): ProviderSkillCatalog {
  return {
    providerId,
    providerName: providerId === 'pi' ? 'Pi Agent' : 'Claude Code',
    catalogSource: 'filesystem',
    invocationSupport: 'native-command',
    activationConfirmation: providerId === 'pi' ? 'none' : 'native-event',
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
    path: entry.path,
    scope: entry.scope,
    rawScope: entry.rawScope,
    sourceLabel: entry.sourceLabel,
    status: 'selected',
  }
}

describe('buildNativeSkillPrompt', () => {
  it('prepends native commands without changing the transcript text', () => {
    expect(
      buildNativeSkillPrompt({
        commandText: '/planning',
        text: 'Create the plan.',
      }),
    ).toBe('/planning\n\nCreate the plan.')
  })
})

describe('resolveNativeSkillInvocation', () => {
  it('formats Claude Code skills as slash commands', () => {
    const entry = skill({ name: 'explain-code' })
    const result = resolveNativeSkillInvocation({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      catalog: catalog([entry]),
      selections: [selection(entry)],
      syntax: 'claude-slash',
      text: 'Explain src/auth.ts',
    })

    expect(result).toEqual({
      ok: true,
      commandText: '/explain-code',
      promptText: '/explain-code\n\nExplain src/auth.ts',
      skillSelections: [
        expect.objectContaining({
          id: entry.id,
          status: 'selected',
        }),
      ],
    })
  })

  it('formats Pi skills as /skill:name commands and preserves arguments', () => {
    const entry = skill({ name: 'pdf-tools' }, 'pi')
    const selected = {
      ...selection(entry),
      argumentText: 'extract',
    }

    const result = resolveNativeSkillInvocation({
      providerId: 'pi',
      providerName: 'Pi Agent',
      catalog: catalog([entry], 'pi'),
      selections: [selected],
      syntax: 'pi-skill-slash',
      text: 'Use the attached report.',
    })

    expect(result).toMatchObject({
      ok: true,
      commandText: '/skill:pdf-tools extract',
      promptText: '/skill:pdf-tools extract\n\nUse the attached report.',
      skillSelections: [
        {
          id: entry.id,
          argumentText: 'extract',
          status: 'selected',
        },
      ],
    })
  })

  it('marks wrong-provider, stale, disabled, and ambiguous skills unavailable', () => {
    const entry = skill()
    const piEntry = skill({ name: 'other' }, 'pi')
    const disabled = skill({ id: 'disabled', name: 'disabled', enabled: false })
    const duplicateA = skill({ id: 'dup-a', name: 'dup' })
    const duplicateB = skill({ id: 'dup-b', name: 'dup' })

    expect(
      resolveNativeSkillInvocation({
        providerId: 'claude-code',
        providerName: 'Claude Code',
        catalog: catalog([entry]),
        selections: [selection(piEntry)],
        syntax: 'claude-slash',
        text: 'Run it.',
      }),
    ).toMatchObject({ ok: false, status: 'unavailable' })

    expect(
      resolveNativeSkillInvocation({
        providerId: 'claude-code',
        providerName: 'Claude Code',
        catalog: catalog([]),
        selections: [selection(entry)],
        syntax: 'claude-slash',
        text: 'Run it.',
      }),
    ).toMatchObject({ ok: false, status: 'unavailable' })

    expect(
      resolveNativeSkillInvocation({
        providerId: 'claude-code',
        providerName: 'Claude Code',
        catalog: catalog([disabled]),
        selections: [selection(disabled)],
        syntax: 'claude-slash',
        text: 'Run it.',
      }),
    ).toMatchObject({ ok: false, status: 'unavailable' })

    expect(
      resolveNativeSkillInvocation({
        providerId: 'claude-code',
        providerName: 'Claude Code',
        catalog: catalog([duplicateA, duplicateB]),
        selections: [selection(duplicateA)],
        syntax: 'claude-slash',
        text: 'Run it.',
      }),
    ).toMatchObject({
      ok: false,
      status: 'unavailable',
      message: expect.stringContaining('ambiguous'),
    })
  })

  it('marks catalog errors and thrown validation as failed', () => {
    const entry = skill()

    expect(
      resolveNativeSkillInvocation({
        providerId: 'claude-code',
        providerName: 'Claude Code',
        catalog: {
          ...catalog([]),
          error: 'catalog unavailable',
        },
        selections: [selection(entry)],
        syntax: 'claude-slash',
        text: 'Run it.',
      }),
    ).toMatchObject({ ok: false, status: 'failed' })

    expect(
      failedNativeSkillInvocation({
        providerName: 'Claude Code',
        selections: [selection(entry)],
        error: new Error('scan failed'),
      }),
    ).toMatchObject({
      ok: false,
      status: 'failed',
      message: 'scan failed',
    })
  })
})
