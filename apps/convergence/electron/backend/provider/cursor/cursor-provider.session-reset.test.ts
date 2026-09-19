import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import { SESSION_RESTARTED_EVENT_TYPE } from '../session-restart.pure'
import {
  ProviderBusyError,
  type SessionHandle,
  type SessionStartConfig,
} from '../provider.types'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
  type MockCursorAcpServer,
} from './cursor-acp-server.fixture'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CursorProvider } from './cursor-provider'

/** A model the fixture's `session/new` does not already report as current. */
const CHOSEN_MODEL = 'composer-2.5[context=300k,fast=true]'

function waitFor(assertion: () => void, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) reject(error)
        else setTimeout(attempt, 5)
      }
    }
    attempt()
  })
}

type Note = { text: string; providerEventType: string | null }

function observe(handle: SessionHandle) {
  const notes: Note[] = []
  const userMessages: string[] = []
  const statuses: string[] = []
  const tokens: string[] = []
  handle.onDelta((delta: SessionDelta) => {
    if (delta.kind !== 'conversation.item.add') return
    if (delta.item.kind === 'note') {
      notes.push({
        text: (delta.item as unknown as { text: string }).text,
        providerEventType: delta.item.providerMeta.providerEventType ?? null,
      })
    }
    if (delta.item.kind === 'message' && delta.item.actor === 'user') {
      userMessages.push((delta.item as unknown as { text: string }).text)
    }
  })
  handle.onStatusChange((status) => statuses.push(status))
  handle.onAttentionChange(() => {})
  handle.onContinuationToken((token) => tokens.push(token))
  return {
    notes,
    userMessages,
    statuses,
    tokens,
    boundaries: () =>
      notes.filter(
        (note) => note.providerEventType === SESSION_RESTARTED_EVENT_TYPE,
      ),
    completions: () =>
      statuses.filter((status) => status === 'completed').length,
  }
}

/** One fixture server per spawned process, in spawn order. */
function world(): {
  servers: MockCursorAcpServer[]
  children: MockCursorAcpChild[]
} {
  const servers: MockCursorAcpServer[] = []
  const children: MockCursorAcpChild[] = []
  spawnMock.mockImplementation(() => {
    const child = new MockCursorAcpChild()
    children.push(child)
    // Process n mints cursor-session-(100n + 1)…, so a respawn's ids never
    // collide with the first process's.
    servers.push(
      createMockCursorAcp(child, {
        firstSessionOrdinal: servers.length * 100 + 1,
      }),
    )
    return child
  })
  return { servers, children }
}

function start(config: Partial<SessionStartConfig> = {}): SessionHandle {
  return new CursorProvider('agent').start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
    ...config,
  })
}

function methods(server: MockCursorAcpServer, fromIndex = 0): string[] {
  return server.requests.slice(fromIndex).map((request) => request.method)
}

/** What a session is given after `session/new`, minus the id it names. */
function sessionSetup(server: MockCursorAcpServer, fromIndex: number) {
  const requests = server.requests.slice(fromIndex)
  const opened = requests.findIndex((r) => r.method === 'session/new')
  return requests
    .slice(opened + 1)
    .filter((r) => r.method !== 'session/prompt')
    .map((r) => {
      const rest = { ...r.params }
      delete rest.sessionId
      return { method: r.method, params: rest }
    })
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('Cursor /clear — the conversation reset (MAR-3216)', () => {
  it('R1: a live /clear opens a new session on the same process and sends no prompt', async () => {
    const { servers, children } = world()
    const handle = start()
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))
    const before = servers[0].requests.length

    expect(handle.sendMessage('/clear')).toBeUndefined()
    await waitFor(() => expect(seen.completions()).toBe(2))

    expect(methods(servers[0], before)).toEqual(['session/new'])
    expect(seen.userMessages).toEqual(['hi'])
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(children[0].kill).not.toHaveBeenCalled()
  })

  it('R2: the new session is the conversation — the next prompt and a respawn both name it', async () => {
    const { servers, children } = world()
    const handle = start()
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))

    handle.sendMessage('/clear')
    await waitFor(() => expect(seen.completions()).toBe(2))
    expect(seen.tokens).toEqual(['cursor-session-1', 'cursor-session-2'])

    handle.sendMessage('next')
    await waitFor(() => expect(seen.completions()).toBe(3))
    const prompts = servers[0].requests.filter(
      (r) => r.method === 'session/prompt',
    )
    expect(prompts.map((r) => r.params?.sessionId)).toEqual([
      'cursor-session-1',
      'cursor-session-2',
    ])

    children[0].emit('exit', 0, null)
    handle.sendMessage('after the process died')
    await waitFor(() => expect(seen.completions()).toBe(4))
    expect(
      servers[1].requests
        .filter((r) => r.method === 'session/load')
        .map((r) => r.params?.sessionId),
    ).toEqual(['cursor-session-2'])
    expect(methods(servers[1])).not.toContain('session/new')
  })

  it('R3: the boundary is said once on success', async () => {
    const { servers } = world()
    const handle = start()
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))

    handle.sendMessage('/clear')
    await waitFor(() => expect(seen.completions()).toBe(2))

    expect(seen.boundaries()).toHaveLength(1)
    expect(seen.statuses).not.toContain('failed')
    expect(servers).toHaveLength(1)
  })

  it('R3: a refused session/new says no boundary, fails the turn and keeps the old session', async () => {
    const { servers } = world()
    const handle = start()
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))
    servers[0].startRefusingSessionNew()

    handle.sendMessage('/clear')
    await waitFor(() => expect(seen.statuses.at(-1)).toBe('failed'))

    expect(seen.boundaries()).toEqual([])
    expect(seen.notes.map((note) => note.text)).toEqual([
      'Could not clear the conversation: Session creation failed. The previous conversation is still active; your next message will resume it.',
    ])
    expect(seen.tokens).toEqual(['cursor-session-1'])

    handle.sendMessage('still here')
    await waitFor(() => expect(seen.completions()).toBe(2))
    expect(
      servers[0].requests
        .filter((r) => r.method === 'session/prompt')
        .map((r) => r.params?.sessionId),
    ).toEqual(['cursor-session-1', 'cursor-session-1'])
  })

  it('R3: a new session that refuses the chosen model is not adopted — the record goes back to the old one', async () => {
    const { servers } = world()
    const handle = start({ model: CHOSEN_MODEL })
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))
    servers[0].startRefusingSetConfigOption()

    handle.sendMessage('/clear')
    await waitFor(() => expect(seen.statuses.at(-1)).toBe('failed'))

    expect(seen.boundaries()).toEqual([])
    expect(seen.tokens).toEqual([
      'cursor-session-1',
      'cursor-session-2',
      'cursor-session-1',
    ])
  })

  it('R4: "not now" is typed while a turn runs, and the running prompt is never cancelled for it', async () => {
    const { servers } = world()
    const child = new MockCursorAcpChild()
    spawnMock.mockReset()
    spawnMock.mockReturnValue(child)
    servers.push(createMockCursorAcp(child, { holdPrompt: true }))
    const handle = start()
    const seen = observe(handle)
    await waitFor(() => expect(methods(servers[0])).toContain('session/prompt'))

    expect(() => handle.sendMessage('/clear')).toThrow(ProviderBusyError)

    expect(servers[0].notifications).toEqual([])
    expect(
      methods(servers[0]).filter((method) => method === 'session/new'),
    ).toHaveLength(1)
    servers[0].resolveHeldPrompt({ stopReason: 'end_turn' })
    await waitFor(() => expect(seen.completions()).toBe(1))
    expect(seen.notes).toEqual([])
  })

  it('R4: "not now" is typed before the start has spawned and while it connects', async () => {
    const child = new MockCursorAcpChild()
    spawnMock.mockReturnValue(child)
    const server = createMockCursorAcp(child, { holdInitialize: true })
    const handle = start()
    observe(handle)

    expect(() => handle.sendMessage('/clear')).toThrow(ProviderBusyError)
    await waitFor(() => expect(methods(server)).toEqual(['initialize']))
    expect(() => handle.sendMessage('/clear')).toThrow(ProviderBusyError)
  })

  it('R4: a second /clear during a reset is refused, and a message during it waits for the boundary', async () => {
    const { servers } = world()
    const handle = start()
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))
    const promptsBefore = servers[0].requests.filter(
      (r) => r.method === 'session/prompt',
    ).length

    handle.sendMessage('/clear')
    expect(() => handle.sendMessage('/clear')).toThrow(ProviderBusyError)
    expect(handle.sendMessage('payload')).toBe('queue-follow-up')
    await waitFor(() => expect(seen.completions()).toBe(2))

    expect(
      servers[0].requests.filter((r) => r.method === 'session/prompt'),
    ).toHaveLength(promptsBefore)
    expect(
      methods(servers[0]).filter((method) => method === 'session/new'),
    ).toHaveLength(2)
  })

  it('R5: /clear as the first message with a stored session opens a fresh one — no load, no prompt', async () => {
    const { servers } = world()
    const handle = start({
      initialMessage: '/clear',
      continuationToken: 'old-session',
    })
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))

    expect(methods(servers[0])).toEqual([
      'initialize',
      'authenticate',
      'session/new',
    ])
    expect(seen.tokens).toEqual(['old-session', 'cursor-session-1'])
    expect(seen.boundaries()).toHaveLength(1)
    expect(seen.userMessages).toEqual([])

    handle.sendMessage('first real message')
    await waitFor(() => expect(seen.completions()).toBe(2))
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(
      servers[0].requests
        .filter((r) => r.method === 'session/prompt')
        .map((r) => r.params?.sessionId),
    ).toEqual(['cursor-session-1'])
  })

  it('R5: /clear as the first message with no session opens nothing and says no boundary, as Codex does', async () => {
    const { servers } = world()
    const handle = start({ initialMessage: '/clear' })
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))

    expect(spawnMock).not.toHaveBeenCalled()
    expect(seen.boundaries()).toEqual([])
    expect(seen.tokens).toEqual([])

    handle.sendMessage('first real message')
    await waitFor(() => expect(seen.completions()).toBe(2))
    expect(methods(servers[0])).toEqual([
      'initialize',
      'authenticate',
      'session/new',
      'session/prompt',
    ])
    expect(seen.userMessages).toEqual(['first real message'])
  })

  it('R5: /clear after the idle process died respawns into a fresh session — never loads the old one', async () => {
    const { servers, children } = world()
    const handle = start()
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))
    children[0].emit('exit', 0, null)

    handle.sendMessage('/clear')
    await waitFor(() => expect(seen.completions()).toBe(2))

    expect(methods(servers[1])).toEqual([
      'initialize',
      'authenticate',
      'session/new',
    ])
    expect(seen.tokens).toEqual(['cursor-session-1', 'cursor-session-101'])

    handle.sendMessage('into the fresh session')
    await waitFor(() => expect(seen.completions()).toBe(3))
    expect(
      servers[1].requests
        .filter((r) => r.method === 'session/prompt')
        .map((r) => r.params?.sessionId),
    ).toEqual(['cursor-session-101'])
    expect(seen.boundaries()).toHaveLength(1)
  })

  it('R6: the model the session was given is applied to the new session exactly as on a first start', async () => {
    const { servers } = world()
    const handle = start({ model: CHOSEN_MODEL })
    const seen = observe(handle)
    await waitFor(() => expect(seen.completions()).toBe(1))
    const firstStart = sessionSetup(servers[0], 0)
    const before = servers[0].requests.length

    handle.sendMessage('/clear')
    await waitFor(() => expect(seen.completions()).toBe(2))

    expect(firstStart).toEqual([
      {
        method: 'session/set_config_option',
        params: { configId: 'model', value: CHOSEN_MODEL },
      },
    ])
    expect(sessionSetup(servers[0], before)).toEqual(firstStart)
    expect(servers[0].requests.at(-1)?.params?.sessionId).toBe(
      'cursor-session-2',
    )
  })
})
