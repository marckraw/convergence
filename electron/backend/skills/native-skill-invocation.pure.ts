import {
  markSkillSelectionsStatus,
  selectionFromCatalogEntry,
  uniqueSkillSelections,
} from './skill-invocation.pure'
import type {
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillInvocationStatus,
  SkillProviderId,
  SkillSelection,
} from './skills.types'

export type NativeSkillCommandSyntax = 'claude-slash' | 'pi-skill-slash'

export type NativeSkillInvocationResolution =
  | {
      ok: true
      commandText: string
      promptText: string
      skillSelections?: SkillSelection[]
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
): NativeSkillInvocationResolution {
  return {
    ok: false,
    status: 'unavailable',
    skillSelections: markSkillSelectionsStatus(selections, 'unavailable') ?? [],
    message,
  }
}

function failed(
  selections: SkillSelection[],
  message: string,
): NativeSkillInvocationResolution {
  return {
    ok: false,
    status: 'failed',
    skillSelections: markSkillSelectionsStatus(selections, 'failed') ?? [],
    message,
  }
}

function duplicateNameCounts(
  entries: SkillCatalogEntry[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = entry.name.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function isNativeCommandName(name: string): boolean {
  return /^\S+$/.test(name.trim())
}

function buildNativeSkillCommand(
  syntax: NativeSkillCommandSyntax,
  entry: SkillCatalogEntry,
  selection: SkillSelection,
): string {
  const argumentText = selection.argumentText?.trim()
  const command =
    syntax === 'pi-skill-slash' ? `/skill:${entry.name}` : `/${entry.name}`

  return argumentText ? `${command} ${argumentText}` : command
}

export function buildNativeSkillPrompt(input: {
  text: string
  commandText: string
}): string {
  const commandText = input.commandText.trim()
  if (!commandText) {
    return input.text
  }
  return input.text.trim() ? `${commandText}\n\n${input.text}` : commandText
}

export function failedNativeSkillInvocation(input: {
  providerName: string
  selections?: SkillSelection[]
  error: unknown
}): NativeSkillInvocationResolution {
  const message =
    input.error instanceof Error
      ? input.error.message
      : `Failed to validate ${input.providerName} skills`

  return failed(input.selections ?? [], message)
}

export function resolveNativeSkillInvocation(input: {
  providerId: SkillProviderId
  providerName: string
  catalog: ProviderSkillCatalog
  selections?: SkillSelection[]
  syntax: NativeSkillCommandSyntax
  text: string
}): NativeSkillInvocationResolution {
  const selections = uniqueSkillSelections(input.selections ?? [])
  if (selections.length === 0) {
    return {
      ok: true,
      commandText: '',
      promptText: input.text,
    }
  }

  const wrongProvider = selections.find(
    (selection) => selection.providerId !== input.providerId,
  )
  if (wrongProvider) {
    return unavailable(
      selections,
      `Selected skill "${wrongProvider.displayName}" is not a ${input.providerName} skill.`,
    )
  }

  if (input.catalog.error) {
    return failed(
      selections,
      `${input.providerName} skill catalog is unavailable: ${input.catalog.error}`,
    )
  }

  const catalogById = new Map(
    input.catalog.skills.map((skill) => [skill.id, skill]),
  )
  const nameCounts = duplicateNameCounts(input.catalog.skills)
  const resolved: Array<{
    entry: SkillCatalogEntry
    selection: SkillSelection
  }> = []

  for (const selection of selections) {
    const entry = catalogById.get(selection.id)
    if (!entry) {
      return unavailable(
        selections,
        `Selected ${input.providerName} skill "${selection.displayName}" is no longer available.`,
      )
    }
    if (!entry.enabled) {
      return unavailable(
        selections,
        `Selected ${input.providerName} skill "${entry.displayName}" is disabled.`,
      )
    }
    if (!isNativeCommandName(entry.name)) {
      return unavailable(
        selections,
        `Selected ${input.providerName} skill "${entry.displayName}" cannot be invoked as a native command.`,
      )
    }
    if ((nameCounts.get(entry.name.toLowerCase()) ?? 0) > 1) {
      return unavailable(
        selections,
        `Selected ${input.providerName} skill "${entry.displayName}" is ambiguous because native invocation uses skill names.`,
      )
    }
    resolved.push({ entry, selection })
  }

  const commandText = resolved
    .map(({ entry, selection }) =>
      buildNativeSkillCommand(input.syntax, entry, selection),
    )
    .join('\n')

  return {
    ok: true,
    commandText,
    promptText: buildNativeSkillPrompt({
      text: input.text,
      commandText,
    }),
    skillSelections: resolved.map(({ entry, selection }) =>
      selectionFromCatalogEntry(entry, 'selected', selection.argumentText),
    ),
  }
}
