import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'fs'
import { mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SandcastleReadinessService } from './sandcastle/readiness.service'
import type {
  SandcastleRunAdapter,
  SandcastleSmokeRunInput,
  SandcastleSmokeRunResult,
} from './sandcastle/runner.service'
import { WorkboardRepository } from './workboard.repository'
import { WorkboardService } from './workboard.service'
import type { WorkboardTrackerProvider } from './tracker/tracker.types'

class FakeSandcastleRunner implements SandcastleRunAdapter {
  lastInput: SandcastleSmokeRunInput | null = null

  async runSmoke(
    input: SandcastleSmokeRunInput,
  ): Promise<SandcastleSmokeRunResult> {
    this.lastInput = input
    input.onEvent({
      type: 'agent_text',
      message: 'Inspecting issue',
      iteration: 1,
      payload: { source: 'fake' },
    })
    return {
      iterations: 1,
      completionSignal: '<promise>COMPLETE</promise>',
      stdout: 'done',
      commits: ['abc123'],
      branch: input.branchName,
      logFilePath: input.logFilePath,
    }
  }
}

async function createReadySandcastleRepo(): Promise<{
  repoPath: string
  homePath: string
}> {
  const repoPath = await mkdtemp(join(tmpdir(), 'convergence-workboard-repo-'))
  const homePath = await mkdtemp(join(tmpdir(), 'convergence-workboard-home-'))
  mkdirSync(join(repoPath, '.sandcastle'), { recursive: true })
  writeFileSync(join(repoPath, '.sandcastle', 'run.ts'), '')
  writeFileSync(join(repoPath, '.sandcastle', 'prompt.md'), 'Do {{ISSUE_KEY}}')
  writeFileSync(join(repoPath, '.sandcastle', 'Dockerfile'), 'FROM node:24')
  mkdirSync(join(homePath, '.claude'), { recursive: true })
  mkdirSync(join(homePath, '.codex'), { recursive: true })
  return { repoPath, homePath }
}

describe('WorkboardService', () => {
  let repository: WorkboardRepository

  beforeEach(() => {
    repository = new WorkboardRepository(getDatabase())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns a real empty snapshot instead of demo data when no sources exist', () => {
    const service = new WorkboardService(repository, [])

    expect(service.getSnapshot()).toEqual({
      selectedRunId: '',
      trackerSources: [],
      candidates: [],
      projectGroups: [],
      activeRuns: [],
    })
  })

  it('syncs enabled sources and derives visible Workboard candidates', async () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'convergence', '/tmp/convergence')",
    ).run()
    repository.upsertTrackerSource({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear personal',
      auth: { token: 'fake' },
      sync: { labels: ['convergence-loop'] },
    })
    repository.upsertProjectMapping({
      id: 'mapping-conv',
      sourceId: 'source-linear',
      name: 'Linear team CONV -> convergence',
      projectId: 'p1',
      priority: 10,
      matcher: { teamKey: 'CONV', labels: ['convergence-loop'] },
      workflowPolicy: 'simple-loop',
    })

    const provider: WorkboardTrackerProvider = {
      type: 'linear',
      syncSource: async (source) => [
        {
          sourceId: source.id,
          externalId: 'lin-1',
          externalKey: 'CONV-209',
          url: 'https://linear.app/acme/issue/CONV-209',
          title: 'Inline comments',
          body: 'Acceptance criteria',
          labels: ['convergence-loop', 'loop-ready'],
          status: 'Todo',
          priority: 'High',
          raw: { teamKey: 'CONV' },
        },
        {
          sourceId: source.id,
          externalId: 'lin-2',
          externalKey: 'CONV-999',
          url: 'https://linear.app/acme/issue/CONV-999',
          title: 'Hidden issue',
          labels: ['loop-ready'],
        },
      ],
    }

    const service = new WorkboardService(repository, [provider])
    const snapshot = await service.syncSources()

    expect(snapshot.trackerSources).toEqual([
      expect.objectContaining({
        id: 'source-linear',
        type: 'linear',
        status: 'connected',
        candidateCount: 1,
      }),
    ])
    expect(snapshot.candidates).toEqual([
      expect.objectContaining({
        externalKey: 'CONV-209',
        state: 'ready',
        priority: 'high',
        mappingStatus: 'mapped',
        projectName: 'convergence',
      }),
    ])
    expect(snapshot.projectGroups).toEqual([
      expect.objectContaining({
        projectId: 'p1',
        projectName: 'convergence',
        repoPath: '/tmp/convergence',
        candidateIds: ['source-linear:lin-1'],
        selectedIssueIds: ['source-linear:lin-1'],
      }),
    ])
  })

  it('starts one simple-loop Sandcastle smoke run and persists progress', async () => {
    const db = getDatabase()
    const { repoPath, homePath } = await createReadySandcastleRepo()
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run('p1', 'convergence', repoPath)
    repository.upsertTrackerSource({
      id: 'source-linear',
      type: 'linear',
      name: 'Linear personal',
    })
    repository.upsertProjectMapping({
      id: 'mapping-conv',
      sourceId: 'source-linear',
      name: 'Linear team CONV -> convergence',
      projectId: 'p1',
      matcher: { teamKey: 'CONV', labels: ['convergence-loop'] },
      workflowPolicy: 'simple-loop',
      sandboxMode: 'docker',
      branchPrefix: 'sandcastle',
      stageDefaults: {
        implementer: {
          provider: 'codex',
          model: 'gpt-5.5',
          effort: 'high',
          maxIterations: 1,
        },
      },
    })
    repository.upsertTrackerIssues('source-linear', [
      {
        sourceId: 'source-linear',
        externalId: 'lin-1',
        externalKey: 'CONV-209',
        url: 'https://linear.app/acme/issue/CONV-209',
        title: 'Inline comments',
        body: 'Acceptance criteria',
        labels: ['convergence-loop', 'loop-ready'],
        raw: { teamKey: 'CONV' },
      },
    ])

    const runner = new FakeSandcastleRunner()
    const service = new WorkboardService(
      repository,
      [],
      new SandcastleReadinessService({
        homeDir: homePath,
        pathEnv: '/usr/bin:/bin:/opt/homebrew/bin',
      }),
      runner,
    )

    const result = await service.startRun({
      projectId: 'p1',
      issueIds: ['source-linear:lin-1'],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const snapshot = service.getSnapshot()
    expect(result.runId).toBeTruthy()
    expect(runner.lastInput).toMatchObject({
      cwd: repoPath,
      providerId: 'codex',
      model: 'gpt-5.5',
      effort: 'high',
      maxIterations: 1,
      promptArgs: expect.objectContaining({
        ISSUE_KEY: 'CONV-209',
        ISSUE_TITLE: 'Inline comments',
      }),
    })
    expect(snapshot.activeRuns).toEqual([
      expect.objectContaining({
        id: result.runId,
        status: 'review',
        branchName: expect.stringContaining('sandcastle/linear-conv-209'),
        issueIds: ['source-linear:lin-1'],
        stages: [
          expect.objectContaining({
            status: 'done',
            iteration: 1,
            logPreview: 'Sandcastle run completed with commits for review',
          }),
        ],
      }),
    ])
    expect(
      service.getRunEvents(result.runId).map((event) => event.type),
    ).toEqual(['lifecycle', 'lifecycle', 'agent_text', 'lifecycle'])
  })
})
