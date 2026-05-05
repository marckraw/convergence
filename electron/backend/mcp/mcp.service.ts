import { ClaudeMcpService } from './claude-mcp.service'
import { CodexMcpService } from './codex-mcp.service'
import { PiMcpService } from './pi-mcp.service'
import { homedir } from 'os'
import type { ProjectService } from '../project/project.service'
import type { DetectedProvider } from '../provider/detect'
import type { ProjectMcpVisibility, ProviderMcpVisibility } from './mcp.types'

const GLOBAL_MCP_VISIBILITY_ID = 'global'
const GLOBAL_MCP_VISIBILITY_NAME = 'Global chat'

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

  async listGlobal(): Promise<ProjectMcpVisibility> {
    const providers = await Promise.all(
      this.detectedProviders.map(async (provider) => {
        switch (provider.id) {
          case 'claude-code': {
            const visibility = await new ClaudeMcpService(
              provider.binaryPath,
            ).list(homedir())
            return { ...visibility, projectServers: [] }
          }
          case 'codex': {
            const visibility = await new CodexMcpService(
              provider.binaryPath,
            ).list(homedir())
            return { ...visibility, projectServers: [] }
          }
          case 'pi':
            return new PiMcpService().list()
          default:
            return null
        }
      }),
    )

    return {
      projectId: GLOBAL_MCP_VISIBILITY_ID,
      projectName: GLOBAL_MCP_VISIBILITY_NAME,
      providers: providers.filter(
        (provider): provider is ProviderMcpVisibility => provider !== null,
      ),
    }
  }
}
