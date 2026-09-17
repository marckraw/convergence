import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: never[]) => unknown>(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: never[]) => unknown,
    ) => {
      electronMocks.handlers.set(channel, handler)
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}))

import { registerCrewIpcHandlers } from './crew.ipc'
import { CrewService } from './crew.service'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import type { SessionCrew } from './crew.types'

function invoke<T>(channel: string, ...args: unknown[]): T {
  const handler = electronMocks.handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler({}, ...(args as never[])) as T
}

describe('crew IPC', () => {
  let broadcast: ReturnType<typeof vi.fn<(crews: SessionCrew[]) => void>>

  beforeEach(() => {
    electronMocks.handlers.clear()
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s1', 'p1', 'codex', 's1', '/tmp/p1')",
    ).run()
    broadcast = vi.fn()
    registerCrewIpcHandlers({ service: new CrewService(db), broadcast })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('registers the whole crew surface', () => {
    expect([...electronMocks.handlers.keys()].sort()).toEqual([
      'crew:addMember',
      'crew:addRecipeMember',
      'crew:create',
      'crew:delete',
      'crew:list',
      'crew:removeMember',
      'crew:setMemberBatonName',
      'crew:setMemberPosition',
      'crew:setMemberSeat',
      'crew:setTrackerBinding',
      'crew:update',
    ])
  })

  it('MAR-3084: setting a tracker binding rides the roster broadcast', () => {
    const created = invoke<SessionCrew>('crew:create', { name: 'Convoy' })
    const bound = invoke<SessionCrew>('crew:setTrackerBinding', created.id, {
      projectId: 'project-1',
    })
    expect(broadcast).toHaveBeenCalledTimes(2)
    expect(broadcast.mock.calls[1]?.[0]).toEqual([bound])
    expect(bound.trackerBinding?.projectId).toBe('project-1')
  })

  it('broadcasts the full roster after every mutation but not on reads', () => {
    const created = invoke<SessionCrew>('crew:create', { name: 'Convoy' })
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast.mock.calls[0]?.[0]).toEqual([created])

    invoke<SessionCrew>('crew:addMember', created.id, 's1')
    invoke<SessionCrew>('crew:update', created.id, { name: 'Stable' })
    invoke<SessionCrew>('crew:removeMember', created.id, { sessionId: 's1' })
    expect(broadcast).toHaveBeenCalledTimes(4)

    invoke<SessionCrew[]>('crew:list')
    expect(broadcast).toHaveBeenCalledTimes(4)

    invoke<void>('crew:delete', created.id)
    expect(broadcast).toHaveBeenCalledTimes(5)
    expect(broadcast.mock.calls[4]?.[0]).toEqual([])
  })

  it('returns the mutated crew to the caller', () => {
    const created = invoke<SessionCrew>('crew:create', {
      name: 'Convoy',
      emoji: '🐎',
    })
    const joined = invoke<SessionCrew>('crew:addMember', created.id, 's1')

    expect(joined.emoji).toBe('🐎')
    expect(joined.sessionIds).toEqual(['s1'])
  })
  /**
   * A recipe is reachable (MAR-3083 lap 2, C). Without a door it was a
   * mechanism only tests could use -- shipped as decoration.
   */
  it('seats a recipe and then edits it by the only name it has', () => {
    const crew = invoke<SessionCrew>('crew:create', { name: 'Night shift' })

    const seated = invoke<SessionCrew>('crew:addRecipeMember', crew.id, {
      batonName: 'errand',
      providerId: 'codex',
      model: 'gpt-6-astra',
      hostPolicy: 'little-monster',
    })
    expect(seated.members).toMatchObject([
      { sessionId: null, batonName: 'errand', kind: 'dynamic' },
    ])

    // Mutation: drop the `crew:addRecipeMember` handler and this throws "No
    // handler registered" -- R3 is unreachable from the app again.
    const edited = invoke<SessionCrew>(
      'crew:setMemberSeat',
      crew.id,
      { batonName: 'errand' },
      { roleCard: 'You are an errand.' },
    )
    expect(edited.members[0]!.roleCard).toBe('You are an errand.')
  })
})
