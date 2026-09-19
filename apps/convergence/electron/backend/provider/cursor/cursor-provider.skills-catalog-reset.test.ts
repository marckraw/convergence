import { afterEach, describe, expect, it, vi } from 'vitest'
import { noopDebugSink } from '../../provider-debug/provider-debug-sink'
import { mapCursorCommandCatalog } from '../../skills/cursor-skills.mapper.pure'
import type { SkillSelection } from '../../skills/skills.types'
import type { SessionHandle } from '../provider.types'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
  type MockCursorAcpServer,
} from './cursor-acp-server.fixture'
import { CURSOR_ACP_RECORDED_INITIALIZE_RESULT } from './cursor-acp.recorded.fixture'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CursorProvider } from './cursor-provider'

function waitFor(assertion: () => void, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) reject(error)
        else setTimeout(attempt, 10)
      }
    }
    attempt()
  })
}

function selectionFromName(name: string): SkillSelection {
  const catalog = mapCursorCommandCatalog({
    availableCommands: [{ name, description: `${name} skill` }],
  })
  const entry = catalog.skills[0]
  if (!entry) throw new Error(`expected catalog entry for ${name}`)
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
 * The one-off `listAvailableCommands` spawn CursorSkillsService makes when the
 * handle has no live catalog to answer from. Its own process, so counting the
 * spawn mock's calls is how a test sees the fallback run.
 */
function attachCommandDiscoveryServer(
  child: MockCursorAcpChild,
  commands: Array<{ name: string; description: string }>,
): void {
  let buffer = ''
  const send = (message: unknown) =>
    child.stdout.write(`${JSON.stringify(message)}\n`)
  const respond = (id: string | number, result: unknown) =>
    setTimeout(() => send({ jsonrpc: '2.0', id, result }), 0)

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
      if (message.method === 'session/new') {
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
        continue
      }
      respond(
        message.id,
        message.method === 'initialize'
          ? CURSOR_ACP_RECORDED_INITIALIZE_RESULT
          : {},
      )
    }
  })
}

/**
 * `acpChildren` are handed out in order to the provider's own spawns; every
 * spawn after them is a skills-discovery process naming `alpha`.
 */
function scriptSpawns(acpChildren: MockCursorAcpChild[]): void {
  spawnMock.mockImplementation(() => {
    const index = spawnMock.mock.calls.length - 1
    const acpChild = acpChildren[index]
    if (acpChild) return acpChild
    const discoveryChild = new MockCursorAcpChild()
    attachCommandDiscoveryServer(discoveryChild, [
      { name: 'alpha', description: 'alpha skill' },
    ])
    return discoveryChild
  })
}

function start(): { handle: SessionHandle; statuses: string[] } {
  const statuses: string[] = []
  const handle = new CursorProvider('agent', noopDebugSink).start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
  })
  handle.onStatusChange((status) => statuses.push(status))
  return { handle, statuses }
}

function announceAlpha(server: MockCursorAcpServer, sessionId: string): void {
  server.send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId,
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'alpha', description: 'alpha skill' }],
      },
    },
  })
}

function prompts(server: MockCursorAcpServer) {
  return server.requests.filter((r) => r.method === 'session/prompt')
}

const completions = (statuses: string[]) =>
  statuses.filter((status) => status === 'completed').length

afterEach(() => {
  spawnMock.mockReset()
})

/**
 * A pin, not a change (MAR-3245 R4, owed by MAR-3240's review): the catalog
 * the live session advertised belongs to that session. A reset or a respawn
 * that kept it would resolve a skill against commands the new session never
 * offered — and nothing in MAR-3240's own tests noticed when the clears were
 * removed. Each test below counts spawns: an extra one IS the fallback
 * listing, i.e. proof that the stored catalog was empty.
 */
describe('Cursor live skill catalog resets (MAR-3245 R4)', () => {
  it('a /clear empties the stored catalog — the next skill send falls back to a listing', async () => {
    const acpChild = new MockCursorAcpChild()
    const server = createMockCursorAcp(acpChild)
    scriptSpawns([acpChild])
    const { handle, statuses } = start()
    await waitFor(() => expect(completions(statuses)).toBe(1))

    announceAlpha(server, 'cursor-session-1')
    await new Promise((resolve) => setTimeout(resolve, 20))

    handle.sendMessage('/clear')
    await waitFor(() => expect(completions(statuses)).toBe(2))
    const spawnsBefore = spawnMock.mock.calls.length
    const promptsBefore = prompts(server).length

    handle.sendMessage('use it', undefined, [selectionFromName('alpha')])
    await waitFor(() => expect(prompts(server)).toHaveLength(promptsBefore + 1))

    expect(spawnMock.mock.calls.length).toBe(spawnsBefore + 1)
    expect(prompts(server).at(-1)?.params?.sessionId).toBe('cursor-session-2')
    expect(prompts(server).at(-1)?.params?.prompt).toEqual([
      { type: 'text', text: '/alpha now\n\nuse it' },
    ])
  })

  it('a respawn after the process exits empties it too', async () => {
    const firstChild = new MockCursorAcpChild()
    const firstServer = createMockCursorAcp(firstChild)
    const secondChild = new MockCursorAcpChild()
    const secondServer = createMockCursorAcp(secondChild, {
      firstSessionOrdinal: 101,
    })
    scriptSpawns([firstChild, secondChild])
    const { handle, statuses } = start()
    await waitFor(() => expect(completions(statuses)).toBe(1))

    announceAlpha(firstServer, 'cursor-session-1')
    await new Promise((resolve) => setTimeout(resolve, 20))

    firstChild.emit('exit', 0, null)
    const spawnsBefore = spawnMock.mock.calls.length

    handle.sendMessage('use it', undefined, [selectionFromName('alpha')])
    await waitFor(() => expect(prompts(secondServer)).toHaveLength(1))

    // The respawn is one; the skills listing is the second — and the second
    // is the one this test is about.
    expect(spawnMock.mock.calls.length).toBe(spawnsBefore + 2)
    expect(prompts(secondServer).at(-1)?.params?.prompt).toEqual([
      { type: 'text', text: '/alpha now\n\nuse it' },
    ])
  })
})
