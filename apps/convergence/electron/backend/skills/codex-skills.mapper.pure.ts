import {
  addDuplicateNameWarnings,
  buildSkillCatalogId,
  normalizeSkillScope,
} from './skill-catalog.pure'
import type {
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillDependency,
  SkillDependencyState,
  SkillWarning,
} from './skills.types'

type CodexSkillRecord = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractFromArray(values: unknown[]): CodexSkillRecord[] {
  const nested = values.flatMap((value) => {
    if (isRecord(value) && Array.isArray(value.skills)) {
      return value.skills.filter(isRecord)
    }
    return []
  })

  if (nested.length > 0) {
    return nested
  }

  return values.filter(isRecord)
}

export function extractCodexSkillRecords(payload: unknown): CodexSkillRecord[] {
  if (Array.isArray(payload)) {
    return extractFromArray(payload)
  }

  if (!isRecord(payload)) {
    return []
  }

  for (const key of ['skills', 'entries', 'items']) {
    const value = payload[key]
    if (Array.isArray(value)) {
      return extractFromArray(value)
    }
  }

  for (const key of ['result', 'data']) {
    const nested = extractCodexSkillRecords(payload[key])
    if (nested.length > 0) {
      return nested
    }
  }

  for (const key of ['cwds', 'byCwd', 'skillsByCwd']) {
    const value = payload[key]
    if (Array.isArray(value)) {
      const nested = extractFromArray(value)
      if (nested.length > 0) {
        return nested
      }
    }
    if (isRecord(value)) {
      const nested = Object.values(value).flatMap(extractCodexSkillRecords)
      if (nested.length > 0) {
        return nested
      }
    }
  }

  return []
}

function normalizeDependencyKind(value: unknown): SkillDependency['kind'] {
  switch (value) {
    case 'mcp':
    case 'mcp-server':
    case 'mcpServer':
      return 'mcp'
    case 'app':
    case 'connector':
      return 'app'
    case 'tool':
      return 'tool'
    case 'script':
      return 'script'
    case 'package':
    case 'npm':
      return 'package'
    default:
      return 'other'
  }
}

function normalizeDependencyState(value: unknown): SkillDependencyState {
  switch (value) {
    case 'available':
      return 'available'
    case 'needs-auth':
    case 'needs_auth':
      return 'needs-auth'
    case 'needs-install':
    case 'needs_install':
      return 'needs-install'
    case 'unknown':
      return 'unknown'
    default:
      return 'declared'
  }
}

function dependencyNameFromRecord(
  record: Record<string, unknown>,
): string | null {
  for (const key of [
    'name',
    'id',
    'tool',
    'app',
    'mcp',
    'mcpServer',
    'package',
    'command',
    'path',
  ]) {
    const value = readString(record, key)
    if (value) {
      return value
    }
  }
  return null
}

function dependencyFromUnknown(
  value: unknown,
  defaultKind: SkillDependency['kind'] = 'other',
): SkillDependency | null {
  if (typeof value === 'string' && value.trim()) {
    return {
      kind: defaultKind,
      name: value.trim(),
      state: 'declared',
    }
  }

  if (!isRecord(value)) {
    return null
  }

  const name = dependencyNameFromRecord(value)
  if (!name) {
    return null
  }

  return {
    kind: normalizeDependencyKind(value.kind ?? value.type ?? defaultKind),
    name,
    state: normalizeDependencyState(value.state ?? value.status),
    raw: value,
  }
}

function dependenciesFromNamedArrays(
  raw: Record<string, unknown>,
): SkillDependency[] {
  const keys: Array<[string, SkillDependency['kind']]> = [
    ['mcp', 'mcp'],
    ['mcps', 'mcp'],
    ['mcpServers', 'mcp'],
    ['apps', 'app'],
    ['tools', 'tool'],
    ['scripts', 'script'],
    ['packages', 'package'],
  ]

  return keys.flatMap(([key, kind]) => {
    const value = raw[key]
    if (!Array.isArray(value)) {
      return []
    }
    return value.flatMap((item) => {
      const dependency = dependencyFromUnknown(item, kind)
      return dependency ? [dependency] : []
    })
  })
}

function mapDependencies(raw: unknown): SkillDependency[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      const dependency = dependencyFromUnknown(item)
      return dependency ? [dependency] : []
    })
  }

  if (isRecord(raw)) {
    const fromNamedArrays = dependenciesFromNamedArrays(raw)
    if (fromNamedArrays.length > 0) {
      return fromNamedArrays
    }

    const dependency = dependencyFromUnknown(raw)
    return dependency ? [dependency] : []
  }

  return []
}

function getRawScope(record: CodexSkillRecord): string | null {
  return readString(record, 'scope') ?? readString(record, 'source')
}

function getInterface(record: CodexSkillRecord): Record<string, unknown> {
  const value = record['interface']
  return isRecord(value) ? value : {}
}

function mapRecord(record: CodexSkillRecord): SkillCatalogEntry | null {
  const name = readString(record, 'name')
  if (!name) {
    return null
  }

  const interfaceMeta = getInterface(record)
  const rawScope = getRawScope(record)
  const normalizedScope = normalizeSkillScope(rawScope)
  const path = readString(record, 'path')
  const displayName = readString(interfaceMeta, 'displayName') ?? name
  const description =
    readString(record, 'description') ??
    readString(interfaceMeta, 'shortDescription') ??
    ''
  const shortDescription =
    readString(interfaceMeta, 'shortDescription') ||
    readString(record, 'description')
  const enabled = record.enabled !== false
  const warnings: SkillWarning[] = []

  if (normalizedScope.warning) {
    warnings.push(normalizedScope.warning)
  }
  if (!path) {
    warnings.push({
      code: 'missing-path',
      message: 'Codex did not report a SKILL.md path for this skill.',
    })
  }
  if (!description) {
    warnings.push({
      code: 'missing-description',
      message: 'Codex did not report a description for this skill.',
    })
  }
  if (!enabled) {
    warnings.push({
      code: 'disabled',
      message: 'This skill is disabled in Codex configuration.',
    })
  }

  return {
    id: buildSkillCatalogId({
      providerId: 'codex',
      name,
      path,
      scope: normalizedScope.scope,
      rawScope,
    }),
    providerId: 'codex',
    providerName: 'Codex',
    name,
    path,
    scope: normalizedScope.scope,
    rawScope,
    displayName,
    description,
    shortDescription,
    sourceLabel: normalizedScope.sourceLabel,
    enabled,
    dependencies: mapDependencies(record.dependencies),
    warnings,
  }
}

export function mapCodexSkillCatalog(payload: unknown): ProviderSkillCatalog {
  const entries = extractCodexSkillRecords(payload)
    .map(mapRecord)
    .filter((entry): entry is SkillCatalogEntry => entry !== null)

  return {
    providerId: 'codex',
    providerName: 'Codex',
    catalogSource: 'native-rpc',
    invocationSupport: 'structured-input',
    activationConfirmation: 'none',
    skills: addDuplicateNameWarnings(entries),
    error: null,
  }
}
