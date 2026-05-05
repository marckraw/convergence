import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProjectService } from '../project/project.service'
import { McpService } from './mcp.service'

describe('McpService', () => {
  let projectService: ProjectService

  beforeEach(() => {
    projectService = new ProjectService(getDatabase())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns a global MCP visibility snapshot without requiring a project', async () => {
    const service = new McpService(projectService, [
      {
        id: 'pi',
        name: 'Pi Agent',
        binaryPath: '/usr/local/bin/pi',
      },
    ])

    const result = await service.listGlobal()

    expect(result).toEqual({
      projectId: 'global',
      projectName: 'Global chat',
      providers: [
        {
          providerId: 'pi',
          providerName: 'Pi Agent',
          globalServers: [],
          projectServers: [],
          error: null,
          note: expect.stringContaining('Pi has no built-in MCP server'),
        },
      ],
    })
  })
})
