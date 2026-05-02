import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { WorkboardRepository } from './workboard.repository'

describe('WorkboardRepository', () => {
  let repository: WorkboardRepository

  beforeEach(() => {
    const db = getDatabase()
    repository = new WorkboardRepository(db)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'convergence', '/tmp/convergence')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('upserts tracker sources and preserves structured config', () => {
    const created = repository.upsertTrackerSource({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear personal',
      auth: { mode: 'token-ref' },
      sync: { label: 'convergence-loop' },
    })

    expect(created).toMatchObject({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear personal',
      enabled: true,
      auth: { mode: 'token-ref' },
      sync: { label: 'convergence-loop' },
    })

    const updated = repository.upsertTrackerSource({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear renamed',
      enabled: false,
      sync: { team: 'CONV' },
    })

    expect(updated.name).toBe('Linear renamed')
    expect(updated.enabled).toBe(false)
    expect(updated.sync).toEqual({ team: 'CONV' })
    expect(repository.listTrackerSources()).toHaveLength(1)
  })

  it('upserts project mappings for tracker sources', () => {
    repository.upsertTrackerSource({
      id: 'source-jira',
      type: 'jira',
      name: 'Jira work',
    })

    const mapping = repository.upsertProjectMapping({
      id: 'mapping-api',
      sourceId: 'source-jira',
      name: 'API backend',
      projectId: 'p1',
      priority: 20,
      matcher: { projectKey: 'API', component: 'Backend' },
      workflowPolicy: 'simple-loop',
      sandboxMode: 'docker',
      branchPrefix: 'sandcastle',
      stageDefaults: { implementer: { provider: 'codex' } },
    })

    expect(mapping).toMatchObject({
      id: 'mapping-api',
      sourceId: 'source-jira',
      name: 'API backend',
      enabled: true,
      priority: 20,
      matcher: { projectKey: 'API', component: 'Backend' },
      projectId: 'p1',
      workflowPolicy: 'simple-loop',
      sandboxMode: 'docker',
      branchPrefix: 'sandcastle',
      stageDefaults: { implementer: { provider: 'codex' } },
    })

    expect(repository.listProjectMappings()).toEqual([mapping])
    expect(repository.listProjectMappingsWithProjects()).toEqual([
      expect.objectContaining({
        ...mapping,
        projectName: 'convergence',
        repositoryPath: '/tmp/convergence',
      }),
    ])
  })

  it('upserts tracker issues idempotently for a source', () => {
    repository.upsertTrackerSource({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear personal',
    })

    const [created] = repository.upsertTrackerIssues('source-linear', [
      {
        sourceId: 'source-linear',
        externalId: 'issue-1',
        externalKey: 'CONV-209',
        url: 'https://linear.app/acme/issue/CONV-209',
        title: 'First title',
        labels: ['convergence-loop', 'loop-ready'],
        status: 'Todo',
        priority: 'High',
        raw: { id: 'issue-1' },
      },
    ])

    expect(created).toMatchObject({
      sourceId: 'source-linear',
      externalId: 'issue-1',
      externalKey: 'CONV-209',
      title: 'First title',
      labels: ['convergence-loop', 'loop-ready'],
      status: 'Todo',
      priority: 'High',
      raw: { id: 'issue-1' },
    })

    const [updated] = repository.upsertTrackerIssues('source-linear', [
      {
        sourceId: 'source-linear',
        externalId: 'issue-1',
        externalKey: 'CONV-209',
        url: 'https://linear.app/acme/issue/CONV-209',
        title: 'Updated title',
        labels: ['convergence-loop', 'loop-blocked'],
        status: 'Blocked',
      },
    ])

    expect(updated.title).toBe('Updated title')
    expect(updated.labels).toEqual(['convergence-loop', 'loop-blocked'])
    expect(repository.listTrackerIssuesBySource('source-linear')).toHaveLength(
      1,
    )
  })

  it('persists workboard runs, stages, linked issues, and ordered events', () => {
    repository.upsertTrackerSource({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear personal',
    })
    repository.upsertTrackerIssues('source-linear', [
      {
        sourceId: 'source-linear',
        externalId: 'lin-1',
        externalKey: 'CONV-209',
        url: 'https://linear.app/acme/issue/CONV-209',
        title: 'Inline comments',
      },
    ])

    const run = repository.createRun({
      id: 'run-1',
      projectId: 'p1',
      status: 'starting',
      workflowPolicy: 'simple-loop',
      sandboxMode: 'docker',
      branchStrategy: 'branch',
      branchName: 'sandcastle/linear-conv-209-inline-comments',
      repoPath: '/tmp/convergence',
      logRoot: '/tmp/convergence/.sandcastle/logs/convergence/run-1',
      progress: { percent: 5 },
      startedAt: '2026-05-01T10:00:00.000Z',
    })
    const stage = repository.createStage({
      id: 'run-1:implementer',
      runId: run.id,
      role: 'implementer',
      status: 'waiting',
      providerId: 'claude-code',
      model: 'claude-sonnet-4-6',
      maxIterations: 1,
    })

    repository.addRunIssues(run.id, ['source-linear:lin-1'], run.branchName)
    repository.appendEvent({
      runId: run.id,
      stageId: stage.id,
      type: 'lifecycle',
      message: 'Started',
    })
    repository.appendEvent({
      runId: run.id,
      stageId: stage.id,
      type: 'agent_text',
      message: 'Working',
      payload: { iteration: 1 },
    })

    repository.updateStage({
      id: stage.id,
      status: 'done',
      iterationCount: 1,
      commitShas: ['abc123'],
    })
    repository.updateRun({
      id: run.id,
      status: 'review',
      progress: { percent: 100 },
      sandcastleResult: { commits: ['abc123'] },
      endedAt: '2026-05-01T10:01:00.000Z',
    })

    expect(repository.listRunsForSnapshot()).toEqual([
      expect.objectContaining({
        id: 'run-1',
        projectName: 'convergence',
        status: 'review',
        progress: { percent: 100 },
      }),
    ])
    expect(repository.listRunIssues(run.id)).toEqual([
      expect.objectContaining({
        trackerIssueId: 'source-linear:lin-1',
        branchName: run.branchName,
      }),
    ])
    expect(repository.listRunStages(run.id)).toEqual([
      expect.objectContaining({
        id: stage.id,
        status: 'done',
        commitShas: ['abc123'],
      }),
    ])
    expect(repository.listRunEvents(run.id)).toEqual([
      expect.objectContaining({ sequence: 1, message: 'Started' }),
      expect.objectContaining({ sequence: 2, message: 'Working' }),
    ])
  })
})
