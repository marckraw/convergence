import { describe, expect, it } from 'vitest'
import {
  selectActiveRunsByProject,
  selectLatestRunsByScriptId,
} from './project-script.selectors.pure'
import type { ProjectScript, ProjectScriptRun } from './project-script.types'

function makeScript(overrides: Partial<ProjectScript> = {}): ProjectScript {
  return {
    id: 'script-1',
    projectId: 'project-1',
    name: 'Build',
    command: 'npm run build',
    icon: 'build',
    cwd: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<ProjectScriptRun> = {}): ProjectScriptRun {
  return {
    id: 'run-1',
    scriptId: 'script-1',
    projectId: 'project-1',
    command: 'npm run build',
    cwd: '/tmp/project',
    status: 'running',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    exitCode: null,
    signal: null,
    errorMessage: null,
    stdout: '',
    stderr: '',
    ...overrides,
  }
}

describe('project script selectors', () => {
  it('selects the latest run per script id', () => {
    const older = makeRun({
      id: 'older',
      startedAt: '2026-01-01T00:00:00.000Z',
    })
    const newer = makeRun({
      id: 'newer',
      startedAt: '2026-01-01T01:00:00.000Z',
    })

    expect(selectLatestRunsByScriptId([older, newer])).toEqual({
      'script-1': newer,
    })
  })

  it('groups only active known script runs by project', () => {
    const script = makeScript()
    const active = makeRun({ id: 'active', status: 'running' })
    const queued = makeRun({ id: 'queued', status: 'queued' })
    const finished = makeRun({ id: 'done', status: 'succeeded' })
    const unknown = makeRun({ id: 'unknown', scriptId: 'missing' })

    expect(
      selectActiveRunsByProject([active, queued, finished, unknown], [script]),
    ).toEqual({
      'project-1': [active, queued],
    })
  })
})
