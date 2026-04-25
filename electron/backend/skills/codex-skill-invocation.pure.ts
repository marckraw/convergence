import type {
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillInvocationStatus,
  SkillSelection,
} from './skills.types'
import {
  markSkillSelectionsStatus,
  selectionFromCatalogEntry,
  uniqueSkillSelections,
} from './skill-invocation.pure'

export { markSkillSelectionsStatus } from './skill-invocation.pure'

export interface CodexSkillInput {
  name: string
  path: string
}

export type CodexSkillInvocationResolution =
  | {
      ok: true
      skillSelections?: SkillSelection[]
      skillInputs: CodexSkillInput[]
    }
  | {
      ok: false
      skillSelections: SkillSelection[]
      status: Extract<SkillInvocationStatus, 'unavailable' | 'failed'>
      message: string
    }

function unavailable(
  selections: SkillSelection[],
  message: string,
): CodexSkillInvocationResolution {
  return {
    ok: false,
    status: 'unavailable',
    skillSelections: markSkillSelectionsStatus(selections, 'unavailable') ?? [],
    message,
  }
}

export function failedCodexSkillInvocation(
  selections: SkillSelection[] | undefined,
  error: unknown,
): CodexSkillInvocationResolution {
  const message =
    error instanceof Error ? error.message : 'Failed to validate Codex skills'

  return {
    ok: false,
    status: 'failed',
    skillSelections: markSkillSelectionsStatus(selections, 'failed') ?? [],
    message,
  }
}

export function resolveCodexSkillInvocation(input: {
  catalog: ProviderSkillCatalog
  selections?: SkillSelection[]
}): CodexSkillInvocationResolution {
  const selections = uniqueSkillSelections(input.selections ?? [])
  if (selections.length === 0) {
    return { ok: true, skillInputs: [] }
  }

  const wrongProvider = selections.find(
    (selection) => selection.providerId !== 'codex',
  )
  if (wrongProvider) {
    return unavailable(
      selections,
      `Selected skill "${wrongProvider.displayName}" is not a Codex skill.`,
    )
  }

  const catalogById = new Map(
    input.catalog.skills.map((skill) => [skill.id, skill]),
  )
  const resolved: SkillCatalogEntry[] = []

  for (const selection of selections) {
    const entry = catalogById.get(selection.id)
    if (!entry) {
      return unavailable(
        selections,
        `Selected Codex skill "${selection.displayName}" is no longer available.`,
      )
    }
    if (!entry.enabled) {
      return unavailable(
        selections,
        `Selected Codex skill "${entry.displayName}" is disabled.`,
      )
    }
    if (!entry.path) {
      return unavailable(
        selections,
        `Selected Codex skill "${entry.displayName}" does not have an invokable path.`,
      )
    }
    resolved.push(entry)
  }

  return {
    ok: true,
    skillSelections: resolved.map((entry) =>
      selectionFromCatalogEntry(entry, 'selected'),
    ),
    skillInputs: resolved.map((entry) => ({
      name: entry.name,
      path: entry.path as string,
    })),
  }
}
