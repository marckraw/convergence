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
import { RelayService } from '../relay/relay.service'

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

  it('MAR-3084 lap 2, C: deleting a crew forgets its tracker key once', async () => {
    const forgetTrackerKey = vi.fn(async () => 'absent')
    electronMocks.handlers.clear()
    registerCrewIpcHandlers({
      service: new CrewService(getDatabase()),
      broadcast,
      forgetTrackerKey,
    })
    const created = invoke<SessionCrew>('crew:create', { name: 'Convoy' })

    await invoke<Promise<void>>('crew:delete', created.id)

    // Mutation: drop the call -> never called, red.
    expect(forgetTrackerKey).toHaveBeenCalledTimes(1)
    expect(forgetTrackerKey).toHaveBeenCalledWith(created.id)
  })

  it('MAR-3084 lap 2, C: a Keychain failure is logged and never fails the delete', async () => {
    const log = vi.fn()
    const service = new CrewService(getDatabase())
    electronMocks.handlers.clear()
    registerCrewIpcHandlers({
      service,
      broadcast,
      forgetTrackerKey: async () => {
        throw new Error('keychain locked')
      },
      log,
    })
    const created = invoke<SessionCrew>('crew:create', { name: 'Convoy' })

    await expect(
      invoke<Promise<void>>('crew:delete', created.id),
    ).resolves.toBeUndefined()
    expect(service.getById(created.id)).toBeNull()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(created.id),
      expect.objectContaining({ message: 'keychain locked' }),
    )
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

  describe('MAR-3157: seat rename carries wires in one transaction', () => {
    it('renames, carries inbound tokens, and broadcasts crews and relays', () => {
      const db = getDatabase()
      db.prepare(
        "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s2', 'p1', 'codex', 's2', '/tmp/p1')",
      ).run()
      db.prepare(
        "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s3', 'p1', 'codex', 's3', '/tmp/p1')",
      ).run()
      const relays = new RelayService(db)
      const broadcastWires = vi.fn()
      electronMocks.handlers.clear()
      broadcast.mockClear()
      registerCrewIpcHandlers({
        service: new CrewService(db),
        relays,
        db,
        broadcast,
        broadcastRelays: broadcastWires,
      })

      const crew = invoke<SessionCrew>('crew:create', { name: 'Night' })
      invoke<SessionCrew>('crew:addMember', crew.id, 's1')
      invoke<SessionCrew>('crew:addMember', crew.id, 's2')
      invoke<SessionCrew>('crew:addMember', crew.id, 's3')
      invoke<SessionCrew>(
        'crew:setMemberBatonName',
        crew.id,
        { sessionId: 's2' },
        'horse opus',
      )

      const inbound = relays.create({
        crewId: crew.id,
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's2',
        conditionToken: 'BATON: horse opus',
      })
      const fan = relays.create({
        crewId: crew.id,
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's3',
        conditionToken: 'BATON: horse opus',
      })

      broadcast.mockClear()
      broadcastWires.mockClear()
      const result = invoke<{
        crew: SessionCrew
        carried: string[]
        left: string[]
      }>('crew:setMemberBatonName', crew.id, { sessionId: 's2' }, 'opus-mac')

      expect(result.carried).toEqual([inbound.id])
      expect(result.left).toEqual([fan.id])
      expect(
        result.crew.members.find((m) => m.sessionId === 's2')?.batonName,
      ).toBe('opus-mac')
      expect(relays.getById(inbound.id)?.conditionToken).toBe('BATON: opus-mac')
      expect(relays.getById(fan.id)?.conditionToken).toBe('BATON: horse opus')
      expect(broadcast).toHaveBeenCalled()
      expect(broadcastWires).toHaveBeenCalled()
    })

    it('R4: a refused relay write rolls the seat name back', () => {
      const db = getDatabase()
      db.prepare(
        "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s2', 'p1', 'codex', 's2', '/tmp/p1')",
      ).run()
      const relays = new RelayService(db)
      electronMocks.handlers.clear()
      registerCrewIpcHandlers({
        service: new CrewService(db),
        relays,
        db,
        broadcast,
        broadcastRelays: vi.fn(),
      })

      const crew = invoke<SessionCrew>('crew:create', { name: 'Night' })
      invoke<SessionCrew>('crew:addMember', crew.id, 's1')
      invoke<SessionCrew>('crew:addMember', crew.id, 's2')
      invoke<SessionCrew>(
        'crew:setMemberBatonName',
        crew.id,
        { sessionId: 's2' },
        'horse opus',
      )
      relays.create({
        crewId: crew.id,
        sourceSessionId: 's1',
        action: 'hail',
        targetSessionId: 's2',
        conditionToken: 'BATON: horse opus',
      })

      db.exec(`CREATE TEMP TRIGGER refuse_relay_rename
        BEFORE UPDATE ON session_relays
        BEGIN SELECT RAISE(ABORT, 'fixture relay refused'); END`)

      expect(() =>
        invoke(
          'crew:setMemberBatonName',
          crew.id,
          { sessionId: 's2' },
          'opus-mac',
        ),
      ).toThrow()

      const members = new CrewService(db).getById(crew.id)!.members
      expect(members.find((m) => m.sessionId === 's2')?.batonName).toBe(
        'horse opus',
      )
      db.exec('DROP TRIGGER refuse_relay_rename')
    })
  })
})
