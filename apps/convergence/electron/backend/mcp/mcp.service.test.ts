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

    expect(result).toMatchObject({
      projectId: 'global',
      projectName: 'Global chat',
      providers: [
        {
          providerId: 'pi',
          providerName: 'Pi Agent',
          projectServers: [],
          error: null,
          note: expect.stringContaining('pi-mcp-adapter'),
        },
      ],
    })
    expect(result.providers[0]?.globalServers).toEqual(expect.any(Array))
  })

  it('includes antigravity in the global MCP snapshot when detected', async () => {
    const service = new McpService(projectService, [
      {
        id: 'antigravity',
        name: 'Antigravity CLI',
        binaryPath: '/usr/local/bin/agy',
      },
    ])

    const result = await service.listGlobal()

    expect(result.providers).toEqual([
      expect.objectContaining({
        providerId: 'antigravity',
        providerName: 'Antigravity CLI',
        error: null,
        note: expect.stringContaining('/mcp list'),
      }),
    ])
  })
})
