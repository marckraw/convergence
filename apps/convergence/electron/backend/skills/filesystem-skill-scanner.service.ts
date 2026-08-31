import { createHash } from 'crypto'
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
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
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

async function isGitRepositoryRoot(dir: string): Promise<boolean> {
  try {
    // `.git` is a directory in a normal clone and a file in worktrees/submodules.
    await stat(join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

/**
 * Collects `relativeRoot` skill directories from the working directory up to —
 * and including — the git repository root, then STOPS. This mirrors how the
 * provider CLIs resolve project skills (Codex: "scans `.agents/skills` in every
 * directory from your current working directory up to the repository root";
 * Claude Code: the project root only). Skills above the repo root belong to a
 * different project and must never be tagged project-local.
 *
 * The home directory is a hard ceiling (home and above are global, never
 * project). When no `.git` is found before reaching home, we fall back to the
 * home-capped walk — Convergence projects are git repositories in practice, so
 * the repo-root cap is what governs the real cases.
 */
export async function collectProjectAncestorSkillRoots(
  startPath: string,
  relativeRoot: string,
  rawScope: string,
  homeDir: string,
): Promise<FilesystemSkillRoot[]> {
  const home = resolve(homeDir)
  const roots: FilesystemSkillRoot[] = []
  let current = resolve(startPath)

  for (;;) {
    if (current === home) {
      break
    }
    roots.push({
      rootPath: join(current, relativeRoot),
      rawScope,
      kind: 'skills-dir',
    })
    if (await isGitRepositoryRoot(current)) {
      break
    }
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return roots
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

/**
 * Computes a cheap content fingerprint for a set of skill roots without reading
 * or parsing any SKILL.md bodies. It walks the same roots `scanFilesystemSkillCatalog`
 * would, then stats each discovered SKILL.md for `(path, mtime, size)`. Adding,
 * removing, or editing a skill changes the discovered set or a file stat, so the
 * fingerprint changes — letting the cache layer skip a full rescan while still
 * detecting new skills on the next open. The walk + stat is far cheaper than the
 * read + frontmatter parse that the full scan performs.
 */
export async function fingerprintFilesystemSkillRoots(
  roots: FilesystemSkillRoot[],
): Promise<string> {
  const discovered = (
    await Promise.all(uniqueSkillRoots(roots).map(discoverSkillFilesInRoot))
  ).flat()
  const uniquePaths = Array.from(
    new Set(discovered.map((skillFile) => resolve(skillFile.path))),
  ).sort()

  const parts = await Promise.all(
    uniquePaths.map(async (path) => {
      try {
        const info = await stat(path)
        return `${path} ${info.mtimeMs} ${info.size}`
      } catch {
        // Vanished between discovery and stat — record absence so the next
        // fingerprint (with the file gone from discovery) still differs.
        return `${path} missing`
      }
    }),
  )

  return createHash('sha1').update(parts.join('\n')).digest('hex')
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
