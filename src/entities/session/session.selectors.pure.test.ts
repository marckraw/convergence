import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS } from '../project'
import type { Project } from '../project/project.types'
import type { NeedsYouDismissals, Session } from './session.types'
import { selectGlobalStatus } from './session.selectors.pure'

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 'session-1',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'Session',
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation' as const,
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Project One',
    repositoryPath: '/tmp/project-one',
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('selectGlobalStatus', () => {
  it('returns empty values when there are no sessions', () => {
    const result = selectGlobalStatus([], {}, [])
    expect(result.running).toEqual([])
    expect(result.needsAttention).toEqual([])
    expect(result.byProject).toEqual([])
    expect(result.lastCompleted).toBeNull()
  })

  it('omits idle-only projects from byProject', () => {
    const sessions = [
      makeSession({ id: 's-1', status: 'idle', attention: 'none' }),
      makeSession({
        id: 's-2',
        projectId: 'project-2',
        status: 'completed',
        attention: 'finished',
      }),
    ]
    const projects = [
      makeProject({}),
      makeProject({ id: 'project-2', name: 'Project Two' }),
    ]

    const result = selectGlobalStatus(sessions, {}, projects)

    expect(result.byProject).toEqual([])
    expect(result.running).toEqual([])
    expect(result.needsAttention).toEqual([])
  })

  it('groups running and attention sessions per project with provider ordering', () => {
    const sessions = [
      makeSession({
        id: 's-1',
        projectId: 'project-1',
        providerId: 'claude-code',
        status: 'running',
      }),
      makeSession({
        id: 's-2',
        projectId: 'project-1',
        providerId: 'codex',
        status: 'idle',
        attention: 'needs-input',
      }),
      makeSession({
        id: 's-3',
        projectId: 'project-2',
        providerId: 'pi',
        status: 'running',
      }),
    ]
    const projects = [
      makeProject({}),
      makeProject({ id: 'project-2', name: 'Project Two' }),
    ]

    const result = selectGlobalStatus(sessions, {}, projects)

    expect(result.running).toHaveLength(2)
    expect(result.needsAttention).toHaveLength(1)
    expect(result.byProject).toHaveLength(2)
    const projectOne = result.byProject.find(
      (entry) => entry.projectId === 'project-1',
    )
    expect(projectOne?.providerIds).toEqual(['codex', 'claude-code'])
    expect(projectOne?.running.map((s) => s.id)).toEqual(['s-1'])
    expect(projectOne?.needsAttention.map((s) => s.id)).toEqual(['s-2'])
  })

  it('filters attention sessions dismissed at the same updatedAt', () => {
    const session = makeSession({
      id: 's-1',
      attention: 'needs-input',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    const dismissals: NeedsYouDismissals = {
      's-1': {
        updatedAt: '2026-02-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
    }

    const result = selectGlobalStatus([session], dismissals, [makeProject({})])

    expect(result.needsAttention).toEqual([])
    expect(result.byProject).toEqual([])
  })

  it('keeps attention sessions when the dismissal is stale', () => {
    const session = makeSession({
      id: 's-1',
      attention: 'needs-approval',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    const dismissals: NeedsYouDismissals = {
      's-1': {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
    }

    const result = selectGlobalStatus([session], dismissals, [makeProject({})])

    expect(result.needsAttention).toHaveLength(1)
  })

  it('sorts projects with attention before projects with only running', () => {
    const sessions = [
      makeSession({
        id: 's-1',
        projectId: 'project-a',
        status: 'running',
        updatedAt: '2026-03-02T00:00:00.000Z',
      }),
      makeSession({
        id: 's-2',
        projectId: 'project-b',
        status: 'running',
        attention: 'needs-input',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }),
    ]
    const projects = [
      makeProject({ id: 'project-a', name: 'A' }),
      makeProject({ id: 'project-b', name: 'B' }),
    ]

    const result = selectGlobalStatus(sessions, {}, projects)

    expect(result.byProject.map((entry) => entry.projectId)).toEqual([
      'project-b',
      'project-a',
    ])
  })

  it('picks the most recently updated completed or failed session', () => {
    const sessions = [
      makeSession({
        id: 's-old',
        status: 'completed',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      makeSession({
        id: 's-new',
        status: 'failed',
        updatedAt: '2026-04-01T00:00:00.000Z',
      }),
      makeSession({
        id: 's-running',
        status: 'running',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }),
    ]

    const result = selectGlobalStatus(sessions, {}, [makeProject({})])

    expect(result.lastCompleted?.id).toBe('s-new')
  })

  it('labels an unknown project id gracefully', () => {
    const sessions = [
      makeSession({
        id: 's-1',
        projectId: 'ghost-project',
        status: 'running',
      }),
    ]

    const result = selectGlobalStatus(sessions, {}, [])

    expect(result.byProject).toHaveLength(1)
    expect(result.byProject[0].projectName).toBe('Unknown project')
  })
})
