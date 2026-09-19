import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import { noopDebugSink } from '../../provider-debug/provider-debug-sink'
import { mapCursorCommandCatalog } from '../../skills/cursor-skills.mapper.pure'
import type { SkillSelection } from '../../skills/skills.types'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
} from './cursor-acp-server.fixture'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CursorProvider } from './cursor-provider'

function waitFor(
  assertion: () => void,
  timeoutMs = 2000,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }
        setTimeout(attempt, intervalMs)
      }
    }
    attempt()
  })
}

function selectionFromName(
  name: string,
  description = `${name} skill`,
): SkillSelection {
  const catalog = mapCursorCommandCatalog({
    availableCommands: [{ name, description }],
  })
  const entry = catalog.skills[0]
  if (!entry) {
    throw new Error(`expected catalog entry for ${name}`)
  }
  return {
    id: entry.id,
    providerId: entry.providerId,
    providerName: entry.providerName,
    name: entry.name,
    displayName: entry.displayName,
    path: entry.path,
    scope: entry.scope,
    rawScope: entry.rawScope,
    sourceLabel: entry.sourceLabel,
    status: 'selected',
    argumentText: 'now',
  }
}

/**
 * Minimal ACP server for CursorSkillsService's one-off `listAvailableCommands`
 * spawn: handshake + session/new that emits the command catalog immediately.
 */
function attachCommandDiscoveryServer(
  child: MockCursorAcpChild,
  commands: Array<{ name: string; description: string }>,
): void {
  let buffer = ''

  function send(message: unknown): void {
    child.stdout.write(`${JSON.stringify(message)}\n`)
  }

  function respond(id: string | number, result: unknown): void {
    setTimeout(() => {
      send({ jsonrpc: '2.0', id, result })
    }, 0)
  }

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
      if (!line) continue

      const message = JSON.parse(line) as {
        id?: string | number
        method?: string
      }
      if (message.id === undefined || !message.method) continue

      switch (message.method) {
        case 'initialize':
          respond(message.id, { protocolVersion: 1 })
          break
        case 'authenticate':
          respond(message.id, {})
          break
        case 'session/new':
          send({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'discovery-session',
              update: {
                sessionUpdate: 'available_commands_update',
                availableCommands: commands,
              },
            },
          })
          respond(message.id, {
            sessionId: 'discovery-session',
            configOptions: [],
          })
          break
        default:
          respond(message.id, {})
          break
      }
    }
  })
}

function startLiveSession(options?: {
  discoveryCommands?: Array<{ name: string; description: string }>
}): {
  server: ReturnType<typeof createMockCursorAcp>
  handle: ReturnType<CursorProvider['start']>
  deltas: SessionDelta[]
  statuses: string[]
} {
  const mainChild = new MockCursorAcpChild()
  const server = createMockCursorAcp(mainChild)
  const discoveryCommands = options?.discoveryCommands ?? [
    { name: 'alpha', description: 'Alpha skill' },
  ]

  spawnMock.mockImplementation(() => {
    if (spawnMock.mock.calls.length <= 1) {
      return mainChild
    }
    const discoveryChild = new MockCursorAcpChild()
    attachCommandDiscoveryServer(discoveryChild, discoveryCommands)
    return discoveryChild
  })

  const provider = new CursorProvider('agent', noopDebugSink)
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
  })
  const deltas: SessionDelta[] = []
  const statuses: string[] = []
  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange((status) => statuses.push(status))
  return { server, handle, deltas, statuses }
}

function sendAvailableCommandsUpdate(
  server: ReturnType<typeof createMockCursorAcp>,
  commands: Array<{ name: string; description: string }>,
): void {
  server.send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'cursor-session-1',
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: commands,
      },
    },
  })
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('CursorProvider live skill catalog (MAR-3240)', () => {
  it('R2: resolves a skill from the live catalog without a second Cursor spawn', async () => {
    const { server, handle, statuses } = startLiveSession()

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    sendAvailableCommandsUpdate(server, [
      { name: 'alpha', description: 'Alpha skill' },
    ])
    // Let the notification land on the runtime before the skill-bearing send.
    await new Promise((resolve) => setTimeout(resolve, 20))

    const spawnCountBefore = spawnMock.mock.calls.length
    const promptCountBefore = server.requests.filter(
      (request) => request.method === 'session/prompt',
    ).length

    handle.sendMessage('use it', undefined, [selectionFromName('alpha')])

    await waitFor(() => {
      expect(
        server.requests.filter(
          (request) => request.method === 'session/prompt',
        ),
      ).toHaveLength(promptCountBefore + 1)
    })

    expect(spawnMock.mock.calls.length).toBe(spawnCountBefore)

    const promptRequest = server.requests
      .filter((request) => request.method === 'session/prompt')
      .at(-1)
    expect(promptRequest?.params?.prompt).toEqual([
      {
        type: 'text',
        text: '/alpha now\n\nuse it',
      },
    ])
  })

  it('R3: falls back to one-off listing when no live catalog has arrived yet', async () => {
    const { server, handle, statuses } = startLiveSession({
      discoveryCommands: [{ name: 'alpha', description: 'Alpha skill' }],
    })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    const spawnCountBefore = spawnMock.mock.calls.length
    const promptCountBefore = server.requests.filter(
      (request) => request.method === 'session/prompt',
    ).length

    handle.sendMessage('first skill', undefined, [selectionFromName('alpha')])

    await waitFor(() => {
      expect(spawnMock.mock.calls.length).toBe(spawnCountBefore + 1)
      expect(
        server.requests.filter(
          (request) => request.method === 'session/prompt',
        ),
      ).toHaveLength(promptCountBefore + 1)
    }, 3000)

    const promptRequest = server.requests
      .filter((request) => request.method === 'session/prompt')
      .at(-1)
    expect(promptRequest?.params?.prompt).toEqual([
      {
        type: 'text',
        text: '/alpha now\n\nfirst skill',
      },
    ])
  })

  it('R3: re-checks via one-off listing when the stored catalog lacks the skill', async () => {
    const { server, handle, statuses } = startLiveSession({
      discoveryCommands: [{ name: 'beta', description: 'Beta skill' }],
    })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    sendAvailableCommandsUpdate(server, [
      { name: 'alpha', description: 'Alpha skill' },
    ])
    await new Promise((resolve) => setTimeout(resolve, 20))

    const spawnCountBefore = spawnMock.mock.calls.length
    const promptCountBefore = server.requests.filter(
      (request) => request.method === 'session/prompt',
    ).length

    handle.sendMessage('need beta', undefined, [selectionFromName('beta')])

    await waitFor(() => {
      expect(spawnMock.mock.calls.length).toBe(spawnCountBefore + 1)
      expect(
        server.requests.filter(
          (request) => request.method === 'session/prompt',
        ),
      ).toHaveLength(promptCountBefore + 1)
    }, 3000)

    const promptRequest = server.requests
      .filter((request) => request.method === 'session/prompt')
      .at(-1)
    expect(promptRequest?.params?.prompt).toEqual([
      {
        type: 'text',
        text: '/beta now\n\nneed beta',
      },
    ])
  })
})
