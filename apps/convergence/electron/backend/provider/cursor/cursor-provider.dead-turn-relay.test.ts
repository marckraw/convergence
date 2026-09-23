import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { LocalExecutionHost } from '../execution-host/local-execution-host'
import { ProviderRegistry } from '../provider-registry'
import { SessionService } from '../../session/session.service'
import type { SessionSettledEvent } from '../../session/session.types'
import { RelayEngine } from '../../relay/relay.engine'
import { RelayService } from '../../relay/relay.service'
import { CrewHailService } from '../../relay/crew-hail.service'
import { CursorProvider } from './cursor-provider'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
} from './cursor-acp-server.fixture'
import {
  CURSOR_ACP_RECORDED_AGENT_MESSAGE_CHUNK,
  CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT,
} from './cursor-acp.recorded.fixture'

/**
 * MAR-3302 R3, at the real seam: a Cursor turn that dies with one `Error: `
 * line goes from the provider through SessionService's settle into the
 * RelayEngine. The engine's own law ("a failed source fires nothing") is
 * pinned with synthetic settles in `relay.engine.test.ts` ('stays silent
 * when the source failed'); this bench proves a Cursor dead turn reaches it
 * as a failed settle at all. Before MAR-3302 it arrived `completed`, and the
 * "any finish" wire carried the crash as the horse's report.
 */

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', async (original) => ({
  ...(await original<typeof import('child_process')>()),
  spawn: spawnMock,
}))

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  spawnMock.mockReset()
  closeDatabase()
  resetDatabase()
})

const DEAD_LINE =
  'Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)'

function rig() {
  const dir = mkdtempSync(join(tmpdir(), 'cursor-dead-turn-'))
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  const server = createMockCursorAcp(child, { holdPrompt: true })
  const db = getDatabase()
  const registry = new ProviderRegistry()
  registry.register(new CursorProvider('agent'))
  const service = new SessionService(db, new LocalExecutionHost(registry), dir)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  db.prepare("INSERT INTO session_crews (id, name) VALUES ('c1', 'Loom')").run()
  const seat = (name: string) => {
    const id = service.create({
      projectId: 'p',
      workspaceId: null,
      providerId: 'cursor',
      model: null,
      effort: null,
      name,
    }).id
    db.prepare(
      'INSERT INTO session_crew_members (crew_id, session_id) VALUES (?, ?)',
    ).run('c1', id)
    return id
  }
  const horse = seat('grok-mac')
  const fable = seat('fable')

  const relays = new RelayService(db)
  const hails = new CrewHailService(db)
  const engine = new RelayEngine({
    relays,
    sessions: service,
    crews: {
      addMember: () => undefined,
      findSeatBySession: () => null,
      findSeatByBatonName: () => null,
      crewIdsForSession: (sessionId) =>
        (
          db
            .prepare(
              'SELECT crew_id FROM session_crew_members WHERE session_id = ?',
            )
            .all(sessionId) as { crew_id: string }[]
        ).map((row) => row.crew_id),
      getLoopLimits: () => ({ roundCap: null, stallMinutes: null }),
    },
    accounts: { listByProvider: () => [] },
    hails,
  })
  const settles: SessionSettledEvent[] = []
  const settling: Promise<void>[] = []
  service.onSessionSettled((event) => {
    settles.push(event)
    settling.push(engine.handleSettle(event))
  })
  service.onDispatchTerminal((event) => engine.handleDispatchTerminal(event))

  cleanup = () => {
    try {
      const handles = (
        service as unknown as {
          activeHandles: Map<string, { dispose: () => void }>
        }
      ).activeHandles
      for (const handle of handles.values()) handle.dispose()
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true })
  }
  return {
    service,
    server,
    relays,
    hails,
    engine,
    horse,
    fable,
    settles,
    settling,
  }
}

describe('a Cursor dead turn carries nothing and reads failed (MAR-3302 R3)', () => {
  it('settles failed: the any-finish wire refuses, the brief hop reads failed, the stall clock calls', async () => {
    const r = rig()
    // Fable's wire into the horse (the brief) and the horse's any-finish
    // wire back: no condition token, so any completed settle would fire it.
    const brief = r.relays.create({
      crewId: 'c1',
      sourceSessionId: r.fable,
      action: 'hail',
      targetSessionId: r.horse,
    })
    const back = r.relays.create({
      crewId: 'c1',
      sourceSessionId: r.horse,
      action: 'hail',
      targetSessionId: r.fable,
    })

    const receipt = await r.service.start(r.horse, { text: 'MAR-3302 lap 1' })
    // The brief's hop, carrying the receipt of the turn that is about to die.
    // Written directly: the stamp on it is the settle's work, not ours.
    const briefHop = r.relays.appendHop({
      relayId: brief.id,
      crewId: 'c1',
      flowRunId: 'run-1',
      sourceSessionId: r.fable,
      targetSessionId: r.horse,
      triggerStatus: 'completed',
      dispatchId: receipt,
      outcome: 'delivered',
    })

    await vi.waitUntil(() =>
      r.server.requests.some((request) => request.method === 'session/prompt'),
    )
    r.server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          ...CURSOR_ACP_RECORDED_AGENT_MESSAGE_CHUNK,
          content: { type: 'text', text: DEAD_LINE },
        },
      },
    })
    await vi.waitUntil(() =>
      r.service
        .getConversation(r.horse)
        .some((item) => item.kind === 'message' && item.text === DEAD_LINE),
    )
    r.server.resolveHeldPrompt(CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT)

    await vi.waitUntil(() => r.settles.length > 0)
    await Promise.all(r.settling)

    // The settle the relay heard. Mutation: keep `completed` for the dead
    // turn -> red here, and the wire below fires.
    expect(r.settles.map((event) => event.status)).toEqual(['failed'])

    // What Loom's horse card reads: `loomHorses` maps a seat's session status
    // `failed` to the `failed` runtime (loom-horses.pure.ts runtimeForStatus,
    // pinned by loom-horses.pure.test.ts ['failed', 'failed', 'Failed']).
    const summary = r.service.getById(r.horse)
    expect(summary?.status).toBe('failed')
    expect(summary?.attention).toBe('failed')

    // The transcript: a warning note, no reply.
    const conversation = r.service.getConversation(r.horse)
    expect(
      conversation.some(
        (item) => item.kind === 'message' && item.text === DEAD_LINE,
      ),
    ).toBe(false)
    expect(
      conversation.filter(
        (item) =>
          item.kind === 'note' &&
          item.level === 'warning' &&
          item.text === `Cursor's turn died: ${DEAD_LINE}`,
      ),
    ).toHaveLength(1)
    expect(r.service.getLastAssistantMessageText(r.horse)).not.toBe(DEAD_LINE)

    // The return wire carried nothing.
    const hops = r.relays.listHops('c1')
    const backHops = hops.filter((hop) => hop.relayId === back.id)
    expect(backHops.map((hop) => hop.outcome)).toEqual(['skipped-failed'])
    expect(r.service.getConversation(r.fable)).toHaveLength(0)

    // The brief's hop came back broken, which the stall clock reads as LOUD
    // on its next tick, without waiting for the window.
    const stamped = hops.find((hop) => hop.id === briefHop.id)
    expect(stamped?.settledStatus).toBe('failed')
    r.engine.checkForStalls()
    expect(r.hails.listOpen()).toMatchObject([
      { crewId: 'c1', reason: 'stall', sessionId: r.horse },
    ])
  })
})
