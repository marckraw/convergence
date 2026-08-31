import {
  addDuplicateNameWarnings,
  buildSkillCatalogId,
  normalizeSkillScope,
} from './skill-catalog.pure'
import type {
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillScope,
  SkillWarning,
} from './skills.types'

type UnknownRecord = Record<string, unknown>

interface CursorCommandSource {
  scope: SkillScope
  rawScope: string | null
  sourceLabel: string
  warning: SkillWarning | null
}

export interface CursorCommandCatalogSummary {
  sessionUpdate: 'available_commands_update'
  commandCount: number
  commands: Array<{
    name: string
    description: string | null
    sourceLabel: string
    hasInput: boolean
  }>
  truncatedCount: number
}

export function extractCursorCommandRecords(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) {
    return extractFromArray(payload)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of [
    'availableCommands',
    'commands',
    'entries',
    'items',
    'notifications',
  ]) {
    const value = payload[key]
    if (Array.isArray(value)) {
      const records = extractFromArray(value)
      if (records.length > 0) return records
    }
  }

  for (const key of ['params', 'update', 'sessionUpdate', 'result', 'data']) {
    const records = extractCursorCommandRecords(payload[key])
    if (records.length > 0) return records
  }

  return readString(payload, 'name') ? [payload] : []
}

export function mapCursorCommandCatalog(
  payload: unknown,
): ProviderSkillCatalog {
  const entries = extractCursorCommandRecords(payload)
    .map(mapCommandRecord)
    .filter((entry): entry is SkillCatalogEntry => entry !== null)

  return {
    providerId: 'cursor',
    providerName: 'Cursor',
    catalogSource: 'native-rpc',
    invocationSupport: 'native-command',
    activationConfirmation: 'none',
    skills: addDuplicateNameWarnings(entries),
    error: null,
  }
}

export function summarizeCursorCommandCatalogUpdate(
  payload: unknown,
  maxCommands = 20,
): CursorCommandCatalogSummary {
  const records = extractCursorCommandRecords(payload)
  const commands = records.slice(0, maxCommands).flatMap((record) => {
    const name = normalizeCommandName(readString(record, 'name'))
    if (!name) return []
    const source = normalizeCursorCommandSource(record)
    return [
      {
        name,
        description: readDescription(record),
        sourceLabel: source.sourceLabel,
        hasInput: isRecord(record.input),
      },
    ]
  })

  return {
    sessionUpdate: 'available_commands_update',
    commandCount: records.length,
    commands,
    truncatedCount: Math.max(records.length - commands.length, 0),
  }
}

function extractFromArray(values: unknown[]): UnknownRecord[] {
  const nested = values.flatMap((value) => extractCursorCommandRecords(value))
  if (nested.length > 0) return nested
  return values
    .filter(isRecord)
    .filter((record) => !!readString(record, 'name'))
}

function mapCommandRecord(record: UnknownRecord): SkillCatalogEntry | null {
  const name = normalizeCommandName(readString(record, 'name'))
  if (!name) return null

  const path =
    readString(record, 'path') ??
    readString(record, 'skillPath') ??
    readString(record, 'filePath')
  const source = normalizeCursorCommandSource(record)
  const displayName =
    normalizeDisplayName(
      readString(record, 'displayName') ??
        readString(record, 'label') ??
        readString(record, 'title'),
    ) ?? name
  const description = readDescription(record) ?? ''
  const enabled =
    record.enabled !== false &&
    record.available !== false &&
    record.disabled !== true
  const warnings: SkillWarning[] = []

  if (source.warning) warnings.push(source.warning)
  if (!description) {
    warnings.push({
      code: 'missing-description',
      message: 'Cursor did not report a description for this command.',
    })
  }
  if (!enabled) {
    warnings.push({
      code: 'disabled',
      message: 'This Cursor command is disabled or unavailable.',
    })
  }
  if (!isNativeCommandName(name)) {
    warnings.push({
      code: 'unsupported-path-invocation',
      message: `Cursor command "${name}" cannot be invoked as a native slash command.`,
    })
  }

  return {
    id: buildSkillCatalogId({
      providerId: 'cursor',
      name,
      path,
      scope: source.scope,
      rawScope: source.rawScope,
    }),
    providerId: 'cursor',
    providerName: 'Cursor',
    name,
    path,
    scope: source.scope,
    rawScope: source.rawScope,
    displayName,
    description,
    shortDescription: description || readInputHint(record),
    sourceLabel: source.sourceLabel,
    enabled: enabled && isNativeCommandName(name),
    dependencies: [],
    warnings,
  }
}

function normalizeCursorCommandSource(
  record: UnknownRecord,
): CursorCommandSource {
  const rawScope =
    readString(record, 'scope') ??
    readString(record, 'source') ??
    readString(record, 'origin') ??
    readString(record, 'category') ??
    readString(record, 'kind') ??
    readString(record, 'type')
  const normalizedRaw = rawScope?.trim().toLowerCase() ?? null
  const commandScopes = new Set([
    'command',
    'commands',
    'slash',
    'slash-command',
    'slash_command',
    'builtin',
    'built-in',
    'built_in',
  ])

  if (!normalizedRaw || commandScopes.has(normalizedRaw)) {
    return {
      scope: 'system',
      rawScope: rawScope ?? 'command',
      sourceLabel: 'Cursor command',
      warning: null,
    }
  }

  const normalized = normalizeSkillScope(rawScope)
  const skillScopes = new Set<SkillScope>([
    'global',
    'user',
    'project',
    'plugin',
    'admin',
    'team',
    'settings',
  ])

  return {
    scope: normalized.scope,
    rawScope,
    sourceLabel: skillScopes.has(normalized.scope)
      ? `Cursor ${normalized.sourceLabel.toLowerCase()} skill`
      : 'Cursor command',
    warning: normalized.warning,
  }
}

function readDescription(record: UnknownRecord): string | null {
  return (
    readString(record, 'description') ??
    readString(record, 'summary') ??
    readInputHint(record)
  )
}

function readInputHint(record: UnknownRecord): string | null {
  return isRecord(record.input) ? readString(record.input, 'hint') : null
}

function normalizeCommandName(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/^\/+/, '')
  return trimmed || null
}

function normalizeDisplayName(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/^\/+/, '')
  return trimmed || null
}

function isNativeCommandName(value: string): boolean {
  return /^\S+$/.test(value.trim())
}

function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
