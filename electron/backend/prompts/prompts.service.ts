import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { basename, join, relative, resolve } from 'path'
import type Database from 'better-sqlite3'
import type { PromptLibraryEntryRow } from '../database/database.types'
import type { ProjectService } from '../project/project.service'
import {
  buildPromptLibraryEntry,
  promptKindFromPath,
  stripPromptFrontmatter,
} from './prompt-library.pure'
import type {
  CreatePromptLibraryInput,
  DeletePromptLibraryInput,
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryDetailsRequest,
  PromptLibraryEntry,
  PromptLibraryOptions,
  PromptLibraryScope,
  UpdatePromptLibraryInput,
} from './prompts.types'

const GLOBAL_PROMPT_CATALOG_ID = 'global'
const GLOBAL_PROMPT_CATALOG_NAME = 'Global chat'
const MAX_PROMPT_BYTES = 1024 * 1024
const MAX_PROMPT_FILES = 500

interface PromptRoot {
  scope: PromptLibraryScope
  path: string
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch {
    return false
  }
}

async function discoverPromptFiles(rootPath: string): Promise<string[]> {
  if (!(await directoryExists(rootPath))) {
    return []
  }

  const discovered: string[] = []
  async function walk(directoryPath: string) {
    if (discovered.length >= MAX_PROMPT_FILES) {
      return
    }

    const entries = await readdir(directoryPath, { withFileTypes: true })
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (entry.name.startsWith('.')) {
        continue
      }

      const entryPath = join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }

      if (entry.isFile() && promptKindFromPath(entryPath)) {
        discovered.push(resolve(entryPath))
      }
    }
  }

  await walk(resolve(rootPath))
  return discovered
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const child = resolve(childPath)
  const parent = resolve(parentPath)
  const pathToChild = relative(parent, child)
  return (
    pathToChild === '' ||
    (!!pathToChild &&
      !pathToChild.startsWith('..') &&
      !pathToChild.startsWith('/'))
  )
}

function parseTagsJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((tag): tag is string => typeof tag === 'string')
  } catch {
    return []
  }
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) {
    throw new Error('Prompt title cannot be empty')
  }
  return trimmed
}

function normalizeDescription(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function normalizePromptText(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Prompt text cannot be empty')
  }
  return `${trimmed}\n`
}

function normalizeTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags ?? []) {
    const value = tag.trim()
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

function slugFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'prompt'
}

function filenameStem(filename: string | null | undefined, title: string) {
  const raw = filename?.trim()
    ? basename(filename.trim())
    : slugFromTitle(title)
  const parsed = raw.replace(/\.[^.]+$/, '')
  return slugFromTitle(parsed)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile()
  } catch {
    return false
  }
}

export class PromptsService {
  private now: () => Date
  private globalPromptsPath: string

  constructor(
    private db: Database.Database,
    private projectService: ProjectService,
    options: { now?: () => Date; globalPromptsPath?: string } = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.globalPromptsPath =
      options.globalPromptsPath ?? join(homedir(), '.convergence', 'prompts')
  }

  async listByProjectId(
    projectId: string,
    _options: PromptLibraryOptions = {},
  ): Promise<PromptLibraryCatalog> {
    const project = this.projectService.getById(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    return this.listForRoots({
      projectId: project.id,
      projectName: project.name,
      roots: [
        {
          scope: 'project',
          path: join(project.repositoryPath, '.convergence', 'prompts'),
        },
        {
          scope: 'global',
          path: this.globalPromptsPath,
        },
      ],
    })
  }

  async listGlobal(
    _options: PromptLibraryOptions = {},
  ): Promise<PromptLibraryCatalog> {
    return this.listForRoots({
      projectId: GLOBAL_PROMPT_CATALOG_ID,
      projectName: GLOBAL_PROMPT_CATALOG_NAME,
      roots: [
        {
          scope: 'global',
          path: this.globalPromptsPath,
        },
      ],
    })
  }

  private async listForRoots(input: {
    projectId: string
    projectName: string
    roots: PromptRoot[]
  }): Promise<PromptLibraryCatalog> {
    const roots = await Promise.all(
      input.roots.map(async (root) => ({
        ...root,
        path: resolve(root.path),
        exists: await directoryExists(root.path),
      })),
    )
    const discovered = (
      await Promise.all(
        roots.map(async (root) => ({
          root,
          paths: await discoverPromptFiles(root.path),
        })),
      )
    ).flatMap(({ root, paths }) =>
      paths.map((path) => ({
        root,
        path,
      })),
    )

    const prompts = (
      await Promise.all(
        discovered.map(async ({ root, path }) => {
          const info = await stat(path)
          if (!info.isFile() || info.size > MAX_PROMPT_BYTES) {
            return null
          }

          const markdown = await readFile(path, 'utf8')
          return buildPromptLibraryEntry({
            path,
            rootPath: root.path,
            scope: root.scope,
            markdown,
            sizeBytes: info.size,
          })
        }),
      )
    )
      .filter((entry): entry is PromptLibraryEntry => entry !== null)
      .map((entry) => this.ensureMetadata(input.projectId, entry))
      .sort((left, right) => {
        if (left.scope !== right.scope) {
          return left.scope === 'project' ? -1 : 1
        }
        return left.title.localeCompare(right.title)
      })

    return {
      projectId: input.projectId,
      projectName: input.projectName,
      prompts,
      roots,
      refreshedAt: this.now().toISOString(),
    }
  }

  async create(input: CreatePromptLibraryInput): Promise<PromptLibraryEntry> {
    const project = this.projectService.getById(input.projectId)
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`)
    }

    const title = normalizeTitle(input.title)
    const promptText = normalizePromptText(input.promptText)
    const description = normalizeDescription(input.description)
    const tags = normalizeTags(input.tags)
    const kind = input.kind ?? 'markdown'
    const root = this.rootForScope(project.repositoryPath, input.scope)
    await mkdir(root.path, { recursive: true })

    const extension = kind === 'text' ? '.txt' : '.md'
    const stem = filenameStem(input.filename, title)
    const path = await this.uniquePromptPath(root.path, stem, extension)

    await writeFile(path, promptText, 'utf8')

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO prompt_library_entries (
          id, project_id, scope, path, title, description, tags_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.scope === 'project' ? project.id : null,
        input.scope,
        path,
        title,
        description,
        JSON.stringify(tags),
      )

    const catalog = await this.listByProjectId(project.id)
    const entry = catalog.prompts.find((prompt) => prompt.id === id)
    if (!entry) {
      throw new Error('Created prompt could not be loaded')
    }
    return entry
  }

  async update(input: UpdatePromptLibraryInput): Promise<PromptLibraryEntry> {
    const entry = await this.requireCatalogEntry(
      input.projectId,
      input.promptId,
      input.path,
    )
    const existing = this.metadataForPath(entry.path)
    if (!existing) {
      throw new Error('Prompt metadata not found')
    }

    const title =
      input.title === undefined ? existing.title : normalizeTitle(input.title)
    const description =
      input.description === undefined
        ? existing.description
        : normalizeDescription(input.description)
    const tags =
      input.tags === undefined
        ? parseTagsJson(existing.tags_json)
        : normalizeTags(input.tags)

    if (input.promptText !== undefined) {
      await writeFile(entry.path, normalizePromptText(input.promptText), 'utf8')
    }

    this.db
      .prepare(
        `UPDATE prompt_library_entries
         SET title = ?,
             description = ?,
             tags_json = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(title, description, JSON.stringify(tags), existing.id)

    const catalog = await this.listByProjectId(input.projectId)
    const updated = catalog.prompts.find((prompt) => prompt.id === existing.id)
    if (!updated) {
      throw new Error('Updated prompt could not be loaded')
    }
    return updated
  }

  async delete(input: DeletePromptLibraryInput): Promise<void> {
    const entry = await this.requireCatalogEntry(
      input.projectId,
      input.promptId,
      input.path,
    )

    try {
      await unlink(entry.path)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'ENOENT') {
        throw error
      }
    }

    this.db
      .prepare('DELETE FROM prompt_library_entries WHERE id = ?')
      .run(entry.id)
  }

  async readDetails(
    input: PromptLibraryDetailsRequest,
  ): Promise<PromptLibraryDetails> {
    const catalog =
      input.projectId === GLOBAL_PROMPT_CATALOG_ID
        ? await this.listGlobal()
        : await this.listByProjectId(input.projectId)
    const requestedPath = resolve(input.path)
    const entry = catalog.prompts.find(
      (prompt) =>
        prompt.id === input.promptId && resolve(prompt.path) === requestedPath,
    )

    if (!entry) {
      throw new Error('Prompt not found in library')
    }

    const root = catalog.roots.find(
      (candidate) =>
        candidate.scope === entry.scope &&
        isPathInside(requestedPath, candidate.path),
    )
    if (!root) {
      throw new Error('Prompt path is outside configured prompt roots')
    }

    const info = await stat(requestedPath)
    if (!info.isFile()) {
      throw new Error('Prompt details path is not a file')
    }
    if (info.size > MAX_PROMPT_BYTES) {
      throw new Error('Prompt file is too large to read')
    }

    const markdown = await readFile(requestedPath, 'utf8')

    return {
      promptId: entry.id,
      path: requestedPath,
      markdown,
      promptText: stripPromptFrontmatter(markdown),
      sizeBytes: info.size,
    }
  }

  private rootForScope(
    projectPath: string,
    scope: PromptLibraryScope,
  ): PromptRoot {
    return {
      scope,
      path:
        scope === 'project'
          ? join(projectPath, '.convergence', 'prompts')
          : this.globalPromptsPath,
    }
  }

  private metadataForPath(path: string): PromptLibraryEntryRow | null {
    const row = this.db
      .prepare('SELECT * FROM prompt_library_entries WHERE path = ?')
      .get(resolve(path)) as PromptLibraryEntryRow | undefined
    return row ?? null
  }

  private ensureMetadata(
    projectId: string,
    entry: PromptLibraryEntry,
  ): PromptLibraryEntry {
    const existing = this.metadataForPath(entry.path)
    if (existing) {
      return this.mergeMetadata(entry, existing)
    }

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO prompt_library_entries (
          id, project_id, scope, path, title, description, tags_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.scope === 'project' ? projectId : null,
        entry.scope,
        entry.path,
        entry.title,
        entry.description,
        JSON.stringify(entry.tags),
      )

    return {
      ...entry,
      id,
    }
  }

  private mergeMetadata(
    entry: PromptLibraryEntry,
    row: PromptLibraryEntryRow,
  ): PromptLibraryEntry {
    return {
      ...entry,
      id: row.id,
      title: row.title,
      description: row.description,
      shortDescription: row.description.split(/\r?\n/)[0]?.trim() || null,
      tags: parseTagsJson(row.tags_json),
    }
  }

  private async uniquePromptPath(
    rootPath: string,
    stem: string,
    extension: string,
  ): Promise<string> {
    let candidate = resolve(rootPath, `${stem}${extension}`)
    let index = 2
    while (await fileExists(candidate)) {
      candidate = resolve(rootPath, `${stem}-${index}${extension}`)
      index += 1
    }
    return candidate
  }

  private async requireCatalogEntry(
    projectId: string,
    promptId: string,
    path: string,
  ): Promise<PromptLibraryEntry> {
    const catalog =
      projectId === GLOBAL_PROMPT_CATALOG_ID
        ? await this.listGlobal()
        : await this.listByProjectId(projectId)
    const requestedPath = resolve(path)
    const entry = catalog.prompts.find(
      (prompt) =>
        prompt.id === promptId && resolve(prompt.path) === requestedPath,
    )

    if (!entry) {
      throw new Error('Prompt not found in library')
    }

    const root = catalog.roots.find(
      (candidate) =>
        candidate.scope === entry.scope &&
        isPathInside(requestedPath, candidate.path),
    )
    if (!root) {
      throw new Error('Prompt path is outside configured prompt roots')
    }

    return entry
  }
}
