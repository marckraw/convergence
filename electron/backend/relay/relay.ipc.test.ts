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

import { registerRelayIpcHandlers } from './relay.ipc'
import { RelayService } from './relay.service'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import type { RelayHop, SessionRelay } from './relay.types'

function invoke<T>(channel: string, ...args: unknown[]): T {
  const handler = electronMocks.handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler({}, ...(args as never[])) as T
}

describe('relay IPC', () => {
  let broadcast: ReturnType<typeof vi.fn<(relays: SessionRelay[]) => void>>
  let service: RelayService

  beforeEach(() => {
    electronMocks.handlers.clear()
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    for (const id of ['s1', 's2']) {
      db.prepare(
        `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
         VALUES (?, 'p1', 'codex', ?, '/tmp/p1')`,
      ).run(id, id)
    }
    db.prepare(
      "INSERT INTO session_crews (id, name) VALUES ('c1', 'Review loop')",
    ).run()
    broadcast = vi.fn()
    service = new RelayService(db)
    registerRelayIpcHandlers({ service, broadcast })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('registers the whole relay surface', () => {
    expect([...electronMocks.handlers.keys()].sort()).toEqual([
      'relay:arm',
      'relay:create',
      'relay:delete',
      'relay:disarm',
      'relay:list',
      'relay:update',
      'relayHops:list',
    ])
  })

  function create(): SessionRelay {
    return invoke<SessionRelay>('relay:create', {
      crewId: 'c1',
      sourceSessionId: 's1',
      action: 'hail',
      targetSessionId: 's2',
    })
  }

  it('creates a wire and rebroadcasts the whole list', () => {
    const relay = create()

    expect(relay).toMatchObject({ sourceSessionId: 's1', armed: true })
    expect(invoke<SessionRelay[]>('relay:list')).toHaveLength(1)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast.mock.calls[0][0]).toHaveLength(1)
  })

  it('arms and disarms through their own one-click channels', () => {
    const relay = create()

    expect(invoke<SessionRelay>('relay:disarm', relay.id).armed).toBe(false)
    expect(invoke<SessionRelay>('relay:arm', relay.id).armed).toBe(true)
    expect(broadcast).toHaveBeenCalledTimes(3)
  })

  it('updates and deletes, rebroadcasting each time', () => {
    const relay = create()

    invoke<SessionRelay>('relay:update', relay.id, { armed: false })
    invoke<void>('relay:delete', relay.id)

    expect(invoke<SessionRelay[]>('relay:list')).toEqual([])
    expect(broadcast).toHaveBeenCalledTimes(3)
    expect(broadcast.mock.calls[2][0]).toEqual([])
  })

  it('serves the hop trail for one crew and never broadcasts for a read', () => {
    const relay = create()
    service.appendHop({
      relayId: relay.id,
      crewId: 'c1',
      flowRunId: 'run-1',
      sourceSessionId: 's1',
      targetSessionId: 's2',
      triggerStatus: 'completed',
      outcome: 'delivered',
    })
    broadcast.mockClear()

    const trail = invoke<RelayHop[]>('relayHops:list', 'c1')

    expect(trail).toHaveLength(1)
    expect(trail[0].outcome).toBe('delivered')
    expect(invoke<RelayHop[]>('relayHops:list', 'other')).toEqual([])
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('surfaces a rejected wire to the caller', () => {
    expect(() =>
      invoke('relay:create', {
        crewId: 'c1',
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's1',
      }),
    ).toThrow('A relay cannot hail the session it listens to')
  })
})
