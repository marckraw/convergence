import { CodexSkillsService } from './codex-skills.service'
import { ClaudeCodeSkillsService } from './claude-code-skills.service'
import { PiSkillsService } from './pi-skills.service'
import { buildProviderSkillErrorCatalog } from './skill-catalog.pure'
import { readdir, readFile, stat } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import type { ProjectService } from '../project/project.service'
import type { DetectedProvider } from '../provider/detect'
import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogOptions,
  SkillDetails,
  SkillDetailsRequest,
  SkillProviderId,
  SkillResourceKind,
  SkillResourceSummary,
} from './skills.types'

export interface SkillProviderCatalogAdapter {
  list: (
    projectPath: string,
    options?: SkillCatalogOptions,
  ) => Promise<ProviderSkillCatalog>
}

export interface SkillsServiceOptions {
  now?: () => Date
  createAdapter?: (
    provider: DetectedProvider,
  ) => SkillProviderCatalogAdapter | null
}

function toSkillProviderId(id: string): SkillProviderId | null {
  switch (id) {
    case 'codex':
      return 'codex'
    case 'claude-code':
      return 'claude-code'
    case 'pi':
      return 'pi'
    default:
      return null
  }
}

function providerErrorCatalog(
  provider: DetectedProvider,
  error: unknown,
): ProviderSkillCatalog | null {
  const providerId = toSkillProviderId(provider.id)
  if (!providerId) {
    return null
  }

  const message =
    error instanceof Error
      ? error.message
      : `Failed to inspect ${provider.name} skills`

  if (providerId === 'codex') {
    return buildProviderSkillErrorCatalog({
      providerId,
      providerName: 'Codex',
      catalogSource: 'native-rpc',
      invocationSupport: 'structured-input',
      activationConfirmation: 'none',
      error: message,
    })
  }

  if (providerId === 'claude-code') {
    return buildProviderSkillErrorCatalog({
      providerId,
      providerName: 'Claude Code',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      error: message,
    })
  }

  if (providerId === 'pi') {
    return buildProviderSkillErrorCatalog({
      providerId,
      providerName: 'Pi Agent',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      error: message,
    })
  }

  return buildProviderSkillErrorCatalog({
    providerId,
    providerName: provider.name,
    catalogSource: 'unsupported',
    invocationSupport: 'unsupported',
    activationConfirmation: 'none',
    error: message,
  })
}

function defaultCreateAdapter(
  provider: DetectedProvider,
): SkillProviderCatalogAdapter | null {
  if (provider.id === 'codex') {
    return new CodexSkillsService(provider.binaryPath)
  }
  if (provider.id === 'claude-code') {
    return new ClaudeCodeSkillsService()
  }
  if (provider.id === 'pi') {
    return new PiSkillsService()
  }

  return null
}

const MAX_SKILL_DETAILS_BYTES = 1024 * 1024
const MAX_RESOURCE_SUMMARIES = 80

const RESOURCE_DIR_KINDS: Record<string, SkillResourceKind> = {
  scripts: 'script',
  references: 'reference',
  assets: 'asset',
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch {
    return false
  }
}

async function summarizeResourceDirectory(
  root: string,
  directoryName: string,
  kind: SkillResourceKind,
): Promise<SkillResourceSummary[]> {
  const directoryPath = join(root, directoryName)
  if (!(await directoryExists(directoryPath))) {
    return []
  }

  const entries = await readdir(directoryPath, { withFileTypes: true })
  return entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_RESOURCE_SUMMARIES)
    .map((entry) => ({
      kind,
      name: entry.name,
      relativePath: `${directoryName}/${entry.name}`,
    }))
}

async function summarizeOtherResources(
  root: string,
): Promise<SkillResourceSummary[]> {
  const entries = await readdir(root, { withFileTypes: true })

  return entries
    .filter((entry) => {
      if (entry.name.toLowerCase() === 'skill.md') {
        return false
      }
      return !(entry.name in RESOURCE_DIR_KINDS)
    })
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_RESOURCE_SUMMARIES)
    .map((entry) => ({
      kind: 'other' as const,
      name: entry.name,
      relativePath: entry.name,
    }))
}

async function summarizeSkillResources(
  skillPath: string,
): Promise<SkillResourceSummary[]> {
  const root = dirname(skillPath)
  const knownResources = await Promise.all(
    Object.entries(RESOURCE_DIR_KINDS).map(([directoryName, kind]) =>
      summarizeResourceDirectory(root, directoryName, kind),
    ),
  )
  const otherResources = await summarizeOtherResources(root)

  return [...knownResources.flat(), ...otherResources].slice(
    0,
    MAX_RESOURCE_SUMMARIES,
  )
}

export class SkillsService {
  private now: () => Date
  private createAdapter: (
    provider: DetectedProvider,
  ) => SkillProviderCatalogAdapter | null

  constructor(
    private projectService: ProjectService,
    private detectedProviders: DetectedProvider[],
    options: SkillsServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.createAdapter = options.createAdapter ?? defaultCreateAdapter
  }

  async listByProjectId(
    projectId: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProjectSkillCatalog> {
    const project = this.projectService.getById(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    const providers = await Promise.all(
      this.detectedProviders.map(async (provider) => {
        try {
          const adapter = this.createAdapter(provider)
          if (!adapter) {
            return null
          }
          return await adapter.list(project.repositoryPath, options)
        } catch (error) {
          return providerErrorCatalog(provider, error)
        }
      }),
    )

    return {
      projectId: project.id,
      projectName: project.name,
      providers: providers.filter(
        (provider): provider is ProviderSkillCatalog => provider !== null,
      ),
      refreshedAt: this.now().toISOString(),
    }
  }

  async readDetails(input: SkillDetailsRequest): Promise<SkillDetails> {
    const catalog = await this.listByProjectId(input.projectId)
    const requestedPath = resolve(input.path)
    const entry = catalog.providers
      .flatMap((provider) => provider.skills)
      .find(
        (skill) =>
          skill.providerId === input.providerId &&
          skill.id === input.skillId &&
          skill.path !== null &&
          resolve(skill.path) === requestedPath,
      )

    if (!entry || !entry.path) {
      throw new Error('Skill not found in provider catalog')
    }

    const skillPath = resolve(entry.path)
    if (basename(skillPath).toLowerCase() !== 'skill.md') {
      throw new Error('Skill details can only read SKILL.md files')
    }

    const info = await stat(skillPath)
    if (!info.isFile()) {
      throw new Error('Skill details path is not a file')
    }
    if (info.size > MAX_SKILL_DETAILS_BYTES) {
      throw new Error('Skill details file is too large to read')
    }

    const [markdown, resources] = await Promise.all([
      readFile(skillPath, 'utf8'),
      summarizeSkillResources(skillPath),
    ])

    return {
      skillId: entry.id,
      providerId: entry.providerId,
      path: skillPath,
      markdown,
      sizeBytes: info.size,
      resources,
    }
  }
}
