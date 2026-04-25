import { CodexSkillsService } from './codex-skills.service'
import { buildProviderSkillErrorCatalog } from './skill-catalog.pure'
import type { ProjectService } from '../project/project.service'
import type { DetectedProvider } from '../provider/detect'
import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogOptions,
  SkillProviderId,
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

  return null
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
}
