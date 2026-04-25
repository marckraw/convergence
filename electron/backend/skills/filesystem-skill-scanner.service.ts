import { readdir, readFile, stat } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import {
  addDuplicateNameWarnings,
  buildSkillCatalogId,
  normalizeSkillScope,
} from './skill-catalog.pure'
import type {
  ProviderSkillCatalog,
  SkillActivationConfirmation,
  SkillCatalogEntry,
  SkillCatalogSource,
  SkillInvocationSupport,
  SkillProviderId,
  SkillWarning,
} from './skills.types'

export type FilesystemSkillRootKind = 'skills-dir' | 'skill-file'
export type FilesystemSkillPathInvocation = 'exact-path' | 'name-only'

export interface FilesystemSkillRoot {
  rootPath: string
  rawScope: string
  kind: FilesystemSkillRootKind
}

export interface FilesystemSkillCatalogInput {
  providerId: SkillProviderId
  providerName: string
  catalogSource?: SkillCatalogSource
  invocationSupport: SkillInvocationSupport
  activationConfirmation: SkillActivationConfirmation
  roots: FilesystemSkillRoot[]
  pathInvocation?: FilesystemSkillPathInvocation
}

interface DiscoveredSkillFile {
  path: string
  rawScope: string
}

interface ParsedFrontmatter {
  fields: Record<string, string>
  body: string
  invalid: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanScalar(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function parseFrontmatter(markdown: string): ParsedFrontmatter {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return {
      fields: {},
      body: markdown,
      invalid: false,
    }
  }

  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  )
  if (endIndex < 0) {
    return {
      fields: {},
      body: markdown,
      invalid: true,
    }
  }

  const fields: Record<string, string> = {}
  let invalid = false

  for (const line of lines.slice(1, endIndex)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    if (/^\s/.test(line)) {
      continue
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(line)
    if (!match) {
      invalid = true
      continue
    }

    const value = cleanScalar(match[2] ?? '')
    if (value === '|' || value === '>') {
      continue
    }
    fields[match[1].toLowerCase()] = value
  }

  return {
    fields,
    body: lines.slice(endIndex + 1).join('\n'),
    invalid,
  }
}

function readFrontmatterString(
  fields: Record<string, string>,
  key: string,
): string | null {
  const value = fields[key.toLowerCase()]
  return value && value.trim() ? value.trim() : null
}

function readFrontmatterBoolean(
  fields: Record<string, string>,
  key: string,
): boolean | null {
  const value = readFrontmatterString(fields, key)
  if (!value) {
    return null
  }

  switch (value.toLowerCase()) {
    case 'true':
    case 'yes':
    case '1':
      return true
    case 'false':
    case 'no':
    case '0':
      return false
    default:
      return null
  }
}

function firstBodyParagraph(body: string): string | null {
  const paragraph: string[] = []

  for (const line of body.split(/\r?\n/)) {
    const text = line.replace(/^#+\s*/, '').trim()
    if (!text) {
      if (paragraph.length > 0) {
        break
      }
      continue
    }
    paragraph.push(text)
  }

  const summary = paragraph.join(' ').replace(/\s+/g, ' ').trim()
  return summary || null
}

function shortDescriptionFrom(description: string): string | null {
  const firstLine = description.split(/\r?\n/)[0]?.trim()
  return firstLine || null
}

async function isFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile()
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch {
    return false
  }
}

async function discoverSkillFileInDirectory(
  directoryPath: string,
): Promise<string | null> {
  const skillPath = join(directoryPath, 'SKILL.md')
  return (await isFile(skillPath)) ? resolve(skillPath) : null
}

async function discoverSkillFilesInRoot(
  root: FilesystemSkillRoot,
): Promise<DiscoveredSkillFile[]> {
  const rootPath = resolve(root.rootPath)

  if (root.kind === 'skill-file') {
    if (
      (await isFile(rootPath)) &&
      basename(rootPath).toLowerCase() === 'skill.md'
    ) {
      return [{ path: rootPath, rawScope: root.rawScope }]
    }
    const skillPath = await discoverSkillFileInDirectory(rootPath)
    return skillPath ? [{ path: skillPath, rawScope: root.rawScope }] : []
  }

  if (!(await isDirectory(rootPath))) {
    return []
  }

  const directSkillPath = await discoverSkillFileInDirectory(rootPath)
  const entries = await readdir(rootPath, { withFileTypes: true })
  const childSkillPaths = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => discoverSkillFileInDirectory(join(rootPath, entry.name))),
  )

  return [directSkillPath, ...childSkillPaths]
    .filter((path): path is string => path !== null)
    .map((path) => ({ path, rawScope: root.rawScope }))
}

function addWarningOnce(
  warnings: SkillWarning[],
  warning: SkillWarning,
): SkillWarning[] {
  if (warnings.some((existing) => existing.code === warning.code)) {
    return warnings
  }
  return [...warnings, warning]
}

function addNameOnlyInvocationWarnings(
  entries: SkillCatalogEntry[],
  providerName: string,
): SkillCatalogEntry[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = entry.name.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return entries.map((entry) => {
    if ((counts.get(entry.name.toLowerCase()) ?? 0) < 2) {
      return entry
    }

    return {
      ...entry,
      warnings: addWarningOnce(entry.warnings, {
        code: 'unsupported-path-invocation',
        message: `${providerName} exposes duplicate skill names; native invocation may select by name rather than this exact SKILL.md path.`,
      }),
    }
  })
}

async function mapSkillFile(
  input: FilesystemSkillCatalogInput,
  discovered: DiscoveredSkillFile,
): Promise<SkillCatalogEntry | null> {
  const markdown = await readFile(discovered.path, 'utf8')
  const parsed = parseFrontmatter(markdown)
  const normalizedScope = normalizeSkillScope(discovered.rawScope)
  const fallbackName = basename(dirname(discovered.path)) || 'skill'
  const name = readFrontmatterString(parsed.fields, 'name') ?? fallbackName
  const description =
    readFrontmatterString(parsed.fields, 'description') ??
    readFrontmatterString(parsed.fields, 'when_to_use') ??
    firstBodyParagraph(parsed.body) ??
    ''
  const disableModelInvocation =
    readFrontmatterBoolean(parsed.fields, 'disable-model-invocation') === true
  const userInvocable =
    readFrontmatterBoolean(parsed.fields, 'user-invocable') !== false
  const enabled = !disableModelInvocation && userInvocable
  const warnings: SkillWarning[] = []

  if (normalizedScope.warning) {
    warnings.push(normalizedScope.warning)
  }
  if (parsed.invalid) {
    warnings.push({
      code: 'invalid-frontmatter',
      message: 'SKILL.md frontmatter could not be fully parsed.',
    })
  }
  if (!description) {
    warnings.push({
      code: 'missing-description',
      message: `${input.providerName} skill does not declare a description.`,
    })
  }
  if (!enabled) {
    warnings.push({
      code: 'disabled',
      message: `${input.providerName} frontmatter marks this skill as not user-invocable.`,
    })
  }

  return {
    id: buildSkillCatalogId({
      providerId: input.providerId,
      name,
      path: discovered.path,
      scope: normalizedScope.scope,
      rawScope: discovered.rawScope,
    }),
    providerId: input.providerId,
    providerName: input.providerName,
    name,
    path: discovered.path,
    scope: normalizedScope.scope,
    rawScope: discovered.rawScope,
    displayName: name,
    description,
    shortDescription: shortDescriptionFrom(description),
    sourceLabel: normalizedScope.sourceLabel,
    enabled,
    dependencies: [],
    warnings,
  }
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const child = resolve(childPath)
  const parent = resolve(parentPath)
  const pathToChild = relative(parent, child)
  return (
    pathToChild === '' ||
    (!!pathToChild && !pathToChild.startsWith('..') && !isAbsolute(pathToChild))
  )
}

export function uniqueSkillRoots(
  roots: FilesystemSkillRoot[],
): FilesystemSkillRoot[] {
  const seen = new Set<string>()
  return roots.filter((root) => {
    const key = `${resolve(root.rootPath)}:${root.rawScope}:${root.kind}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export async function scanFilesystemSkillCatalog(
  input: FilesystemSkillCatalogInput,
): Promise<ProviderSkillCatalog> {
  const discovered = (
    await Promise.all(
      uniqueSkillRoots(input.roots).map(discoverSkillFilesInRoot),
    )
  ).flat()
  const seenPaths = new Set<string>()
  const entries = (
    await Promise.all(
      discovered
        .filter((skillFile) => {
          const key = resolve(skillFile.path)
          if (seenPaths.has(key)) {
            return false
          }
          seenPaths.add(key)
          return true
        })
        .map((skillFile) => mapSkillFile(input, skillFile)),
    )
  ).filter((entry): entry is SkillCatalogEntry => entry !== null)

  const deduplicated = addDuplicateNameWarnings(entries)
  const skills =
    input.pathInvocation === 'name-only'
      ? addNameOnlyInvocationWarnings(deduplicated, input.providerName)
      : deduplicated

  return {
    providerId: input.providerId,
    providerName: input.providerName,
    catalogSource: input.catalogSource ?? 'filesystem',
    invocationSupport: input.invocationSupport,
    activationConfirmation: input.activationConfirmation,
    skills,
    error: null,
  }
}

export function readSettingsSkillEntries(settings: unknown): string[] {
  if (!isRecord(settings) || !Array.isArray(settings.skills)) {
    return []
  }

  return settings.skills.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return [entry.trim()]
    }
    if (
      isRecord(entry) &&
      typeof entry.path === 'string' &&
      entry.path.trim()
    ) {
      return [entry.path.trim()]
    }
    return []
  })
}
