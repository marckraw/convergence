import type { ProjectMcpVisibility } from '@/shared/types/mcp.types'

export const mcpServerApi = {
  listByProjectId: (projectId: string): Promise<ProjectMcpVisibility> =>
    window.electronAPI.mcp.listByProjectId(projectId),

  listGlobal: (): Promise<ProjectMcpVisibility> =>
    window.electronAPI.mcp.listGlobal(),
}
