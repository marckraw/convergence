import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProjectService } from '../project/project.service'
import { SkillsService } from './skills.service'
import type { DetectedProvider } from '../provider/detect'
import type { ProviderSkillCatalog } from './skills.types'

const FIXED_NOW = new Date('2026-04-25T10:00:00.000Z')

function codexProvider(): DetectedProvider {
  return {
    id: 'codex',
    name: 'Codex',
    binaryPath: '/usr/local/bin/codex',
  }
}

function catalog(): ProviderSkillCatalog {
  return {
    providerId: 'codex',
    providerName: 'Codex',
    catalogSource: 'native-rpc',
    invocationSupport: 'structured-input',
    activationConfirmation: 'none',
    skills: [],
    error: null,
  }
}

describe('SkillsService', () => {
  let projectService: ProjectService
  let tempDir: string
  let gitRepoPath: string

  beforeEach(() => {
    projectService = new ProjectService(getDatabase())
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-skills-test-'))
    gitRepoPath = join(tempDir, 'repo')
    mkdirSync(gitRepoPath)
    mkdirSync(join(gitRepoPath, '.git'))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('throws when the project is missing', async () => {
    const service = new SkillsService(projectService, [], {
      now: () => FIXED_NOW,
    })

    await expect(service.listByProjectId('missing')).rejects.toThrow(
      'Project not found: missing',
    )
  })

  it('omits unsupported providers in phase 1', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const service = new SkillsService(
      projectService,
      [
        {
          id: 'claude-code',
          name: 'Claude Code',
          binaryPath: '/usr/local/bin/claude',
        },
      ],
      { now: () => FIXED_NOW },
    )

    await expect(service.listByProjectId(project.id)).resolves.toEqual({
      projectId: project.id,
      projectName: project.name,
      providers: [],
      refreshedAt: FIXED_NOW.toISOString(),
    })
  })

  it('returns the Codex catalog and forwards options', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const list = vi.fn(async () => catalog())
    const service = new SkillsService(projectService, [codexProvider()], {
      now: () => FIXED_NOW,
      createAdapter: () => ({ list }),
    })

    const result = await service.listByProjectId(project.id, {
      forceReload: true,
    })

    expect(list).toHaveBeenCalledWith(gitRepoPath, { forceReload: true })
    expect(result).toEqual({
      projectId: project.id,
      projectName: project.name,
      providers: [catalog()],
      refreshedAt: FIXED_NOW.toISOString(),
    })
  })

  it('converts adapter failures into provider errors', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const service = new SkillsService(projectService, [codexProvider()], {
      now: () => FIXED_NOW,
      createAdapter: () => ({
        list: async () => {
          throw new Error('codex unavailable')
        },
      }),
    })

    const result = await service.listByProjectId(project.id)

    expect(result.providers).toEqual([
      expect.objectContaining({
        providerId: 'codex',
        providerName: 'Codex',
        catalogSource: 'native-rpc',
        invocationSupport: 'structured-input',
        activationConfirmation: 'none',
        skills: [],
        error: 'codex unavailable',
      }),
    ])
  })
})
