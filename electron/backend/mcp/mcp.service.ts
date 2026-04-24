import { ClaudeMcpService } from './claude-mcp.service'
import { CodexMcpService } from './codex-mcp.service'
import { PiMcpService } from './pi-mcp.service'
import type { ProjectService } from '../project/project.service'
import type { DetectedProvider } from '../provider/detect'
import type { ProjectMcpVisibility, ProviderMcpVisibility } from './mcp.types'

export class McpService {
  constructor(
    private projectService: ProjectService,
    private detectedProviders: DetectedProvider[],
  ) {}

  async listByProjectId(projectId: string): Promise<ProjectMcpVisibility> {
    const project = this.projectService.getById(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    const providers = await Promise.all(
      this.detectedProviders.map(async (provider) => {
        switch (provider.id) {
          case 'claude-code':
            return new ClaudeMcpService(provider.binaryPath).list(
              project.repositoryPath,
            )
          case 'codex':
            return new CodexMcpService(provider.binaryPath).list(
              project.repositoryPath,
            )
          case 'pi':
            return new PiMcpService().list()
          default:
            return null
        }
      }),
    )

    return {
      projectId: project.id,
      projectName: project.name,
      providers: providers.filter(
        (provider): provider is ProviderMcpVisibility => provider !== null,
      ),
    }
  }
}
