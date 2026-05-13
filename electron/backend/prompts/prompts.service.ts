import { homedir } from 'os'
import { readdir, readFile, stat } from 'fs/promises'
import { join, relative, resolve } from 'path'
import type { ProjectService } from '../project/project.service'
import {
  buildPromptLibraryEntry,
  promptKindFromPath,
  stripPromptFrontmatter,
} from './prompt-library.pure'
import type {
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryDetailsRequest,
  PromptLibraryEntry,
  PromptLibraryOptions,
  PromptLibraryScope,
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

export class PromptsService {
  private now: () => Date

  constructor(
    private projectService: ProjectService,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date())
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
          path: join(homedir(), '.convergence', 'prompts'),
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
          path: join(homedir(), '.convergence', 'prompts'),
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
}
