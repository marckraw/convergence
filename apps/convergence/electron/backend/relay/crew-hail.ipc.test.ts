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

import { registerCrewHailIpcHandlers } from './crew-hail.ipc'
import { CrewHailService } from './crew-hail.service'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import type { CrewHail } from './crew-hail.types'

function invoke<T>(channel: string, ...args: unknown[]): T {
  const handler = electronMocks.handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler({}, ...(args as never[])) as T
}

/**
 * The hail's door, pinned (MAR-2759).
 *
 * A hail is an alarm, and the whole point of the feature is that a parked loop
 * cannot be silent. So the surface itself is asserted by name: delete a handler
 * or change a channel by one character and every other suite in the repo stays
 * green while the renderer's chair never lights again.
 */
describe('crew hail IPC', () => {
  let service: CrewHailService
  let broadcast: ReturnType<typeof vi.fn<(hails: CrewHail[]) => void>>

  beforeEach(() => {
    electronMocks.handlers.clear()
    service = new CrewHailService(getDatabase())
    broadcast = vi.fn()
    registerCrewHailIpcHandlers({ service, broadcast })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function raise(
    overrides: Partial<Parameters<CrewHailService['raise']>[0]> = {},
  ) {
    return service.raise({
      crewId: 'c1',
      flowRunId: 'run-1',
      reason: 'terminal',
      sessionId: 's1',
      baton: 'marcin',
      message: 'This one is a judgement call.',
      detail: 'handed the work to you',
      ...overrides,
    })
  }

  it('registers the whole hail surface', () => {
    expect([...electronMocks.handlers.keys()].sort()).toEqual([
      'crewHails:acknowledge',
      'crewHails:acknowledgeCrew',
      'crewHails:listOpen',
    ])
  })

  it('answers with the calls still asking, newest first', () => {
    raise()
    raise({ flowRunId: 'run-2', reason: 'unrouted', baton: 'fabel' })

    const open = invoke<CrewHail[]>('crewHails:listOpen')
    expect(open.map((hail) => hail.reason)).toEqual(['unrouted', 'terminal'])
    // The message rides with the call rather than being referenced: the whole
    // reason the loop stopped is in those words.
    expect(open[1].message).toContain('judgement call')
  })

  it('drops an answered call and tells every window', () => {
    const hail = raise()
    expect(hail).not.toBeNull()

    invoke<void>('crewHails:acknowledge', (hail as CrewHail).id)

    expect(invoke<CrewHail[]>('crewHails:listOpen')).toHaveLength(0)
    // Broadcast, not just answered: a second window showing an alarm nobody
    // is asking about any more is the same lie in the other direction.
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast.mock.calls[0]?.[0]).toEqual([])
  })

  it('answers a whole crew at once and says how many that was', () => {
    raise()
    raise({ flowRunId: 'run-2', reason: 'unrouted' })
    raise({ crewId: 'c2' })

    expect(invoke<number>('crewHails:acknowledgeCrew', 'c1')).toBe(2)
    expect(
      invoke<CrewHail[]>('crewHails:listOpen').map((hail) => hail.crewId),
    ).toEqual(['c2'])
  })

  it('does not broadcast on a read', () => {
    raise()
    invoke<CrewHail[]>('crewHails:listOpen')

    expect(broadcast).not.toHaveBeenCalled()
  })
})
