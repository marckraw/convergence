import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProjectService } from '../project/project.service'
import { SkillsService } from './skills.service'
import { buildSkillCatalogId } from './skill-catalog.pure'
import type { DetectedProvider } from '../provider/detect'
import type { ProviderSkillCatalog, SkillCatalogEntry } from './skills.types'

const FIXED_NOW = new Date('2026-04-25T10:00:00.000Z')

function codexProvider(): DetectedProvider {
  return {
    id: 'codex',
    name: 'Codex',
    binaryPath: '/usr/local/bin/codex',
  }
}

function catalog(skills: SkillCatalogEntry[] = []): ProviderSkillCatalog {
  return {
    providerId: 'codex',
    providerName: 'Codex',
    catalogSource: 'native-rpc',
    invocationSupport: 'structured-input',
    activationConfirmation: 'none',
    skills,
    error: null,
  }
}

function catalogEntry(path: string): SkillCatalogEntry {
  const input = {
    providerId: 'codex' as const,
    name: 'skill-a',
    path,
    scope: 'user' as const,
    rawScope: 'user',
  }

  return {
    id: buildSkillCatalogId(input),
    providerId: 'codex',
    providerName: 'Codex',
    name: input.name,
    path,
    scope: input.scope,
    rawScope: input.rawScope,
    displayName: 'Skill A',
    description: 'Reads details.',
    shortDescription: null,
    sourceLabel: 'User',
    enabled: true,
    dependencies: [],
    warnings: [],
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

  it('reads details for a catalog-backed SKILL.md file', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const skillDir = join(tempDir, 'skills', 'skill-a')
    mkdirSync(join(skillDir, 'scripts'), { recursive: true })
    mkdirSync(join(skillDir, 'references'), { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '# Skill A\n\nUse it well.\n')
    writeFileSync(join(skillDir, 'scripts', 'run.sh'), '#!/bin/sh\n')
    writeFileSync(join(skillDir, 'references', 'notes.md'), '# Notes\n')
    const entry = catalogEntry(join(skillDir, 'SKILL.md'))
    const service = new SkillsService(projectService, [codexProvider()], {
      now: () => FIXED_NOW,
      createAdapter: () => ({ list: async () => catalog([entry]) }),
    })

    const details = await service.readDetails({
      projectId: project.id,
      providerId: 'codex',
      skillId: entry.id,
      path: entry.path ?? '',
    })

    expect(details).toEqual({
      skillId: entry.id,
      providerId: 'codex',
      path: entry.path,
      markdown: '# Skill A\n\nUse it well.\n',
      sizeBytes: 24,
      resources: [
        {
          kind: 'script',
          name: 'run.sh',
          relativePath: 'scripts/run.sh',
        },
        {
          kind: 'reference',
          name: 'notes.md',
          relativePath: 'references/notes.md',
        },
      ],
    })
  })

  it('rejects details reads for paths not present in the catalog', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const skillDir = join(tempDir, 'skills', 'skill-a')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '# Skill A\n')
    const entry = catalogEntry(join(skillDir, 'SKILL.md'))
    const service = new SkillsService(projectService, [codexProvider()], {
      now: () => FIXED_NOW,
      createAdapter: () => ({ list: async () => catalog([entry]) }),
    })

    await expect(
      service.readDetails({
        projectId: project.id,
        providerId: 'codex',
        skillId: entry.id,
        path: join(tempDir, 'not-cataloged', 'SKILL.md'),
      }),
    ).rejects.toThrow('Skill not found in provider catalog')
  })
})
