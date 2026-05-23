import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { setTimeout as delay } from 'timers/promises'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProjectScriptsRunner } from './project-scripts.runner'
import { ProjectScriptsService } from './project-scripts.service'
import type { ProjectScriptRun } from './project-scripts.types'

function insertProject(
  id: string,
  repositoryPath = `/tmp/${id}`,
  name = id,
): void {
  getDatabase()
    .prepare(
      `INSERT INTO projects (id, name, repository_path)
       VALUES (?, ?, ?)`,
    )
    .run(id, name, repositoryPath)
}

describe('ProjectScriptsService', () => {
  let service: ProjectScriptsService

  beforeEach(() => {
    service = new ProjectScriptsService(getDatabase())
    insertProject('project-1', '/tmp/project-1')
    insertProject('project-2', '/tmp/project-2')
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates and lists scripts for a project', () => {
    const script = service.create({
      projectId: 'project-1',
      name: ' Dev ',
      command: ' npm run dev ',
    })

    expect(script.projectId).toBe('project-1')
    expect(script.name).toBe('Dev')
    expect(script.command).toBe('npm run dev')
    expect(script.cwd).toBeNull()
    expect(script.createdAt).toEqual(expect.any(String))
    expect(script.updatedAt).toEqual(expect.any(String))

    expect(service.listByProjectId('project-1')).toEqual([script])
    expect(service.listByProjectId('project-2')).toEqual([])
  })

  it('updates scripts without moving them between projects', () => {
    const script = service.create({
      projectId: 'project-1',
      name: 'Test',
      command: 'npm test',
    })

    const updated = service.update(script.id, {
      name: 'Unit tests',
      command: 'npm run test:unit',
      cwd: './packages/app',
    })

    expect(updated).toMatchObject({
      id: script.id,
      projectId: 'project-1',
      name: 'Unit tests',
      command: 'npm run test:unit',
      cwd: '/tmp/project-1/packages/app',
    })
    expect(service.listByProjectId('project-2')).toEqual([])
  })

  it('deletes scripts', () => {
    const script = service.create({
      projectId: 'project-1',
      name: 'Build',
      command: 'npm run build',
    })

    service.delete(script.id)

    expect(service.listByProjectId('project-1')).toEqual([])
  })

  it('throws when creating a script for an unknown project', () => {
    expect(() =>
      service.create({
        projectId: 'missing',
        name: 'Build',
        command: 'npm run build',
      }),
    ).toThrow('Project not found: missing')
  })

  it('rejects empty script names and commands', () => {
    expect(() =>
      service.create({
        projectId: 'project-1',
        name: ' ',
        command: 'npm run build',
      }),
    ).toThrow('Script name is required')

    expect(() =>
      service.create({
        projectId: 'project-1',
        name: 'Build',
        command: ' ',
      }),
    ).toThrow('Script command is required')
  })

  it('cascades scripts and runs when a project is deleted', () => {
    const script = service.create({
      projectId: 'project-1',
      name: 'Build',
      command: 'npm run build',
    })
    const run = service.createRunRecord({ scriptId: script.id })

    getDatabase().prepare('DELETE FROM projects WHERE id = ?').run('project-1')

    expect(service.listByProjectId('project-1')).toEqual([])
    expect(service.listRunsByProjectId('project-1')).toEqual([])
    expect(
      getDatabase()
        .prepare('SELECT id FROM project_script_runs WHERE id = ?')
        .get(run.id),
    ).toBeUndefined()
  })

  it('creates run records with denormalized command and cwd', () => {
    const script = service.create({
      projectId: 'project-1',
      name: 'Migrate',
      command: './scripts/migrate.sh',
      cwd: '/tmp/project-1/apps/api',
    })
    const run = service.createRunRecord({
      scriptId: script.id,
      status: 'running',
    })

    service.update(script.id, {
      command: './scripts/migrate-v2.sh',
      cwd: '/tmp/project-1/apps/web',
    })

    expect(service.listRunsByProjectId('project-1')).toEqual([
      expect.objectContaining({
        id: run.id,
        scriptId: script.id,
        projectId: 'project-1',
        command: './scripts/migrate.sh',
        cwd: '/tmp/project-1/apps/api',
        status: 'running',
        stdout: '',
        stderr: '',
      }),
    ])
  })

  it('defaults run cwd to the project repository path', () => {
    const script = service.create({
      projectId: 'project-1',
      name: 'Dev',
      command: 'npm run dev',
    })

    const run = service.createRunRecord({ scriptId: script.id })

    expect(run.cwd).toBe('/tmp/project-1')
    expect(run.status).toBe('queued')
  })

  it('returns active runs and null for missing runs', () => {
    const script = service.create({
      projectId: 'project-1',
      name: 'Build',
      command: 'npm run build',
    })
    const queued = service.createRunRecord({ scriptId: script.id })
    const running = service.markRunRunning(queued.id)
    const finished = service.finishRun({
      id: service.createRunRecord({ scriptId: script.id }).id,
      status: 'succeeded',
      exitCode: 0,
    })

    expect(service.getRun(running.id)).toMatchObject({ id: running.id })
    expect(service.getRun('missing')).toBeNull()
    expect(service.listActiveRuns()).toEqual([running])
    expect(service.listActiveRuns()).not.toContainEqual(finished)
  })

  it('runs a non-interactive command and captures output', async () => {
    insertProject('runner-project', process.cwd())
    const events: Array<{ channel: string; payload: unknown }> = []
    const runner = new ProjectScriptsRunner({
      service,
      broadcast: (channel, payload) => events.push({ channel, payload }),
    })
    const script = service.create({
      projectId: 'runner-project',
      name: 'Echo',
      command: 'printf ok',
    })

    const run = runner.run(script.id)
    const finished = await waitForFinishedRun(run.id)

    expect(finished.status).toBe('succeeded')
    expect(finished.exitCode).toBe(0)
    expect(finished.stdout).toBe('ok')
    expect(
      events.some((event) => event.channel === 'project-script-run:output'),
    ).toBe(true)
  })

  it('marks stopped long-running commands as stopped', async () => {
    insertProject('runner-project', process.cwd())
    const runner = new ProjectScriptsRunner({
      service,
      broadcast: () => undefined,
    })
    const script = service.create({
      projectId: 'runner-project',
      name: 'Sleep',
      command: 'sleep 5',
    })

    const run = runner.run(script.id)
    await delay(50)
    runner.stop(run.id)
    const finished = await waitForFinishedRun(run.id)

    expect(finished.status).toBe('stopped')
  })

  it('handles stop requests for missing and already finished runs', () => {
    insertProject('runner-project', process.cwd())
    const runner = new ProjectScriptsRunner({
      service,
      broadcast: () => undefined,
    })
    const script = service.create({
      projectId: 'runner-project',
      name: 'Echo',
      command: 'printf ok',
    })
    const run = service.finishRun({
      id: service.createRunRecord({ scriptId: script.id }).id,
      status: 'succeeded',
      exitCode: 0,
    })

    expect(runner.stop(run.id)).toEqual(run)
    expect(() => runner.stop('missing-run')).toThrow(
      'Project script run not found: missing-run',
    )
  })

  it('ignores process output and exit after the run row is deleted', async () => {
    insertProject('runner-project', process.cwd())
    const events: Array<{ channel: string; payload: unknown }> = []
    const runner = new ProjectScriptsRunner({
      service,
      broadcast: (channel, payload) => events.push({ channel, payload }),
    })
    const script = service.create({
      projectId: 'runner-project',
      name: 'Delayed',
      command: 'sleep 0.1; printf done',
    })

    const run = runner.run(script.id)
    getDatabase()
      .prepare('DELETE FROM projects WHERE id = ?')
      .run('runner-project')
    await delay(250)

    expect(service.getRun(run.id)).toBeNull()
    expect(
      events.filter(
        (event) =>
          event.channel === 'project-script-run:updated' &&
          (event.payload as ProjectScriptRun).id === run.id,
      ),
    ).toHaveLength(1)
  })
})

async function waitForFinishedRun(runId: string): Promise<ProjectScriptRun> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = serviceForWait().getRun(runId)
    if (run && run.status !== 'queued' && run.status !== 'running') {
      return run
    }
    await delay(25)
  }
  throw new Error(`Timed out waiting for run ${runId}`)
}

function serviceForWait(): ProjectScriptsService {
  return new ProjectScriptsService(getDatabase())
}
