import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProjectService } from '../project/project.service'
import { PromptsService } from './prompts.service'

const FIXED_NOW = new Date('2026-05-13T10:00:00.000Z')

describe('PromptsService', () => {
  let projectService: ProjectService
  let tempDir: string
  let gitRepoPath: string
  let db: ReturnType<typeof getDatabase>

  beforeEach(() => {
    db = getDatabase()
    projectService = new ProjectService(db)
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-prompts-test-'))
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
    const service = new PromptsService(db, projectService, {
      now: () => FIXED_NOW,
    })

    await expect(service.listByProjectId('missing')).rejects.toThrow(
      'Project not found: missing',
    )
  })

  it('lists project prompts from .convergence/prompts', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const promptsDir = join(gitRepoPath, '.convergence', 'prompts')
    mkdirSync(promptsDir, { recursive: true })
    writeFileSync(
      join(promptsDir, 'review-pr.md'),
      [
        '---',
        'title: Review PR',
        'description: Review a pull request.',
        'tags: review, github',
        '---',
        'Prompt body.',
      ].join('\n'),
    )
    writeFileSync(join(promptsDir, 'scratch.json'), '{}')
    const service = new PromptsService(db, projectService, {
      now: () => FIXED_NOW,
    })

    const catalog = await service.listByProjectId(project.id)

    expect(catalog).toMatchObject({
      projectId: project.id,
      projectName: project.name,
      refreshedAt: FIXED_NOW.toISOString(),
    })
    expect(catalog.prompts).toHaveLength(1)
    expect(catalog.prompts[0]).toMatchObject({
      title: 'Review PR',
      description: 'Review a pull request.',
      relativePath: 'review-pr.md',
      scope: 'project',
      sourceLabel: 'Project',
      kind: 'markdown',
      tags: ['review', 'github'],
    })
  })

  it('reads details only for catalog-backed prompts', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const promptsDir = join(gitRepoPath, '.convergence', 'prompts')
    mkdirSync(promptsDir, { recursive: true })
    const promptPath = join(promptsDir, 'review-pr.md')
    writeFileSync(
      promptPath,
      ['---', 'title: Review PR', '---', 'Review this PR.'].join('\n'),
    )
    const service = new PromptsService(db, projectService, {
      now: () => FIXED_NOW,
    })
    const catalog = await service.listByProjectId(project.id)
    const prompt = catalog.prompts[0]

    await expect(
      service.readDetails({
        projectId: project.id,
        promptId: prompt.id,
        path: prompt.path,
      }),
    ).resolves.toMatchObject({
      promptId: prompt.id,
      path: promptPath,
      promptText: 'Review this PR.',
    })

    await expect(
      service.readDetails({
        projectId: project.id,
        promptId: prompt.id,
        path: join(tempDir, 'other.md'),
      }),
    ).rejects.toThrow('Prompt not found in library')
  })

  it('creates, updates, and deletes managed prompt files', async () => {
    const project = projectService.create({ repositoryPath: gitRepoPath })
    const service = new PromptsService(db, projectService, {
      now: () => FIXED_NOW,
    })

    const created = await service.create({
      projectId: project.id,
      scope: 'project',
      title: 'Review PR',
      description: 'Review pull requests.',
      tags: ['review', 'github', 'review'],
      promptText: 'Review this pull request.',
      kind: 'markdown',
    })

    expect(created).toMatchObject({
      title: 'Review PR',
      description: 'Review pull requests.',
      relativePath: 'review-pr.md',
      scope: 'project',
      tags: ['review', 'github'],
    })

    const updated = await service.update({
      projectId: project.id,
      promptId: created.id,
      path: created.path,
      title: 'Careful Review',
      description: 'Review carefully.',
      tags: ['review'],
      promptText: 'Look for regressions.',
    })

    expect(updated).toMatchObject({
      id: created.id,
      title: 'Careful Review',
      description: 'Review carefully.',
      tags: ['review'],
    })
    await expect(
      service.readDetails({
        projectId: project.id,
        promptId: created.id,
        path: created.path,
      }),
    ).resolves.toMatchObject({
      promptText: 'Look for regressions.',
    })

    await service.delete({
      projectId: project.id,
      promptId: created.id,
      path: created.path,
    })

    const catalog = await service.listByProjectId(project.id)
    expect(catalog.prompts).toEqual([])
  })
})
