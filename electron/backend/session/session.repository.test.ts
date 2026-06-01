import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import {
  SessionRepository,
  type CreateSessionRecordInput,
} from './session.repository'

const PROJECT_ID = 'project-1'

function createProject(db: Database.Database): void {
  db.prepare(
    `INSERT INTO projects (id, name, repository_path, settings)
     VALUES (?, ?, ?, ?)`,
  ).run(PROJECT_ID, 'Project', '/repo', '{}')
}

function createSessionInput(
  overrides: Partial<CreateSessionRecordInput> = {},
): CreateSessionRecordInput {
  return {
    id: 'session-1',
    contextKind: 'project',
    projectId: PROJECT_ID,
    workspaceId: null,
    providerId: 'codex',
    model: 'gpt-5',
    effort: 'medium',
    permissionConfig: undefined,
    name: 'Task',
    workingDirectory: '/repo',
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    ...overrides,
  }
}

describe('SessionRepository', () => {
  let db: Database.Database
  let repository: SessionRepository

  beforeEach(() => {
    db = getDatabase()
    repository = new SessionRepository(db)
    createProject(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates and finds a session row', () => {
    repository.create(
      createSessionInput({
        permissionConfig: {
          preset: 'custom',
          codex: {
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
          },
        },
      }),
    )

    const row = repository.findById('session-1')

    expect(row).toMatchObject({
      id: 'session-1',
      context_kind: 'project',
      project_id: PROJECT_ID,
      provider_id: 'codex',
      model: 'gpt-5',
      effort: 'medium',
      name: 'Task',
      working_directory: '/repo',
      primary_surface: 'conversation',
      html_mode_enabled: 0,
    })
    expect(row?.permission_config).toContain('workspace-write')
  })

  it('persists html mode on create and updates it later', () => {
    repository.create(
      createSessionInput({
        htmlModeEnabled: true,
      }),
    )

    expect(repository.findById('session-1')?.html_mode_enabled).toBe(1)

    repository.setHtmlModeEnabled('session-1', false)

    expect(repository.findById('session-1')?.html_mode_enabled).toBe(0)
  })

  it('lists project and global sessions separately', () => {
    repository.create(createSessionInput({ id: 'project-session' }))
    repository.create(
      createSessionInput({
        id: 'global-session',
        contextKind: 'global',
        projectId: null,
        workspaceId: null,
        workingDirectory: '/global',
      }),
    )

    expect(repository.listByProjectId(PROJECT_ID).map((row) => row.id)).toEqual(
      ['project-session'],
    )
    expect(repository.listGlobal().map((row) => row.id)).toEqual([
      'global-session',
    ])
    expect(
      repository
        .listAll()
        .map((row) => row.id)
        .sort(),
    ).toEqual(['global-session', 'project-session'])
  })

  it('updates simple session row fields', () => {
    repository.create(createSessionInput())

    repository.rename('session-1', 'Renamed')
    repository.setPrimarySurface('session-1', 'terminal')
    repository.setArchivedAt('session-1', '2026-05-28T00:00:00.000Z')

    expect(repository.findById('session-1')).toMatchObject({
      name: 'Renamed',
      name_auto_generated: 1,
      primary_surface: 'terminal',
      archived_at: '2026-05-28T00:00:00.000Z',
    })
    expect(repository.isAutoNamed('session-1')).toBe(true)
  })

  it('deletes a session row', () => {
    repository.create(createSessionInput())

    repository.delete('session-1')

    expect(repository.findById('session-1')).toBeUndefined()
  })
})
