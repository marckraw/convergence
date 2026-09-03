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
      'crew:create',
      'crew:delete',
      'crew:list',
      'crew:removeMember',
      'crew:setMemberBatonName',
      'crew:update',
    ])
  })

  it('broadcasts the full roster after every mutation but not on reads', () => {
    const created = invoke<SessionCrew>('crew:create', { name: 'Convoy' })
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast.mock.calls[0]?.[0]).toEqual([created])

    invoke<SessionCrew>('crew:addMember', created.id, 's1')
    invoke<SessionCrew>('crew:update', created.id, { name: 'Stable' })
    invoke<SessionCrew>('crew:removeMember', created.id, 's1')
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
})
