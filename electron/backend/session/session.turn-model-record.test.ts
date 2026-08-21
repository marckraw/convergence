import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import type { ReasoningEffort } from '../provider/provider.types'
import { SessionService } from './session.service'
import { TurnCaptureService } from './turn/turn-capture.service'
import { MODEL_CHANGED_EVENT_TYPE } from './session-model-change.pure'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: spawnMock,
    default: { ...actual, spawn: spawnMock },
  }
})

import { ClaudeCodeProvider } from '../provider/claude-code/claude-code-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
  }
}

function waitFor(assertion: () => void, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) return reject(error)
        setTimeout(attempt, 10)
      }
    }
    attempt()
  })
}

/** The argv Convergence actually handed the Claude binary for turn `call`. */
function spawnArgs(call: number): string[] {
  return (spawnMock.mock.calls[call]?.[1] as string[] | undefined) ?? []
}

function flagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag)
  if (index < 0) return null
  return args[index + 1] ?? null
}

/**
 * A transcript that mixes models says so (MAR-2551).
 *
 * The per-turn record is checked against the **argv** of the turn it belongs
 * to, not against the session row. The row only ever holds the latest
 * selection, so a test that compared the record to the row would agree with
 * itself even if every turn were stamped with the same value.
 */
describe('a transcript that mixes models records it (MAR-2551)', () => {
  let service: SessionService
  let turnCapture: TurnCaptureService
  let tempDir: string
  let projectId: string
  let db: Database.Database
  let sessionIds: string[]

  beforeEach(() => {
    db = getDatabase()
    const registry = new ProviderRegistry()
    registry.register(new ClaudeCodeProvider('/usr/local/bin/claude'))

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-turn-model-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))

    service = new SessionService(
      db,
      new LocalExecutionHost(registry),
      join(tempDir, 'global-sessions'),
    )
    turnCapture = new TurnCaptureService(new GitService(), db, {
      debounceMs: 0,
    })
    service.setTurnCaptureService(turnCapture)

    sessionIds = []
    projectId = 'turn-model-project'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'test', ?)",
    ).run(projectId, repoPath)
  })

  afterEach(async () => {
    // Turn finalization is debounced and async; letting it land after the
    // database closes turns a green run into a wall of unhandled rejections.
    for (const id of sessionIds) await turnCapture.flushPendingEnd(id)
    spawnMock.mockReset()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function createSession(input: {
    model: string
    effort: ReasoningEffort
    name: string
  }) {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: input.model,
      effort: input.effort,
      name: input.name,
    })
    sessionIds.push(session.id)
    return session
  }

  function queueChildren(count: number): MockChildProcess[] {
    const children = Array.from({ length: count }, () => new MockChildProcess())
    children.forEach((child) => spawnMock.mockReturnValueOnce(child))
    return children
  }

  function playTurn(child: MockChildProcess, conversationId: string): void {
    child.stdout.write(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: conversationId,
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: 'begin' }] },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'ack' }] },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({ type: 'result', is_error: false, result: 'Done' }) +
        '\n',
    )
    child.emitExit(0)
  }

  async function waitForIdle(sessionId: string): Promise<void> {
    await waitFor(() => {
      expect(service.getById(sessionId)?.status).toBe('completed')
    })
    await waitFor(() => {
      expect(service.getSummaryById(sessionId)?.continuationToken).toBeTruthy()
    })
  }

  function modelChangeNotes(sessionId: string): string[] {
    return service
      .getConversation(sessionId)
      .filter(
        (item) =>
          item.kind === 'note' &&
          item.providerMeta?.providerEventType === MODEL_CHANGED_EVENT_TYPE,
      )
      .map((item) => (item as { text: string }).text)
  }

  /** Marcin's own case, seen a week later from the transcript. */
  it('stamps each turn with the model that turn was actually spawned on', async () => {
    const [first, second] = queueChildren(2)

    const session = createSession({
      model: 'fable',
      effort: 'high',
      name: 'quota switch',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    playTurn(first, 'claude-conversation-1')
    await waitForIdle(session.id)

    service.setModelSelection(session.id, {
      providerId: 'claude-code',
      model: 'opus',
      effort: 'medium',
    })

    await service.sendMessage(session.id, { text: 'carry on' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    playTurn(second, 'claude-conversation-1')

    await waitFor(() => {
      expect(turnCapture.listTurns(session.id)).toHaveLength(2)
    })

    const turns = turnCapture.listTurns(session.id)

    // Each record checked against the argv of its own turn.
    expect(turns[0].model).toBe(flagValue(spawnArgs(0), '--model'))
    expect(turns[0].effort).toBe(flagValue(spawnArgs(0), '--effort'))
    expect(turns[1].model).toBe(flagValue(spawnArgs(1), '--model'))
    expect(turns[1].effort).toBe(flagValue(spawnArgs(1), '--effort'))

    // And the pair actually differs, so the assertions above are not two
    // readings of one value.
    expect([turns[0].model, turns[1].model]).toEqual(['fable', 'opus'])
    expect([turns[0].effort, turns[1].effort]).toEqual(['high', 'medium'])
  })

  it('draws one boundary in the transcript where the model changed', async () => {
    const [first, second] = queueChildren(2)

    const session = createSession({
      model: 'fable',
      effort: 'high',
      name: 'boundary',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    playTurn(first, 'claude-conversation-2')
    await waitForIdle(session.id)

    expect(modelChangeNotes(session.id)).toEqual([])

    service.setModelSelection(session.id, {
      providerId: 'claude-code',
      model: 'opus',
      effort: 'medium',
    })

    expect(modelChangeNotes(session.id)).toEqual([
      'Model changed — fable → opus, effort high → medium. Replies above this ' +
        'point came from fable; replies below come from opus.',
    ])

    await service.sendMessage(session.id, { text: 'carry on' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    playTurn(second, 'claude-conversation-2')
    await waitForIdle(session.id)

    // The boundary is a one-off, not a banner that follows the session around.
    expect(modelChangeNotes(session.id)).toHaveLength(1)
  })

  /**
   * The dispatch window, proved where all three records could disagree
   * (MAR-2550). Between a send reading the session row and the process it
   * spawns, the session looks idle: no running status, no handle. A model
   * change accepted there would leave the argv on the old model, the turn
   * stamped with the new one, and a divider in the transcript announcing a
   * boundary that never happened.
   *
   * This is the fourth defect from that one window — run 20's opener/payload
   * race, run 22's relay mute carrier, MAR-2539's one-deep per-turn slots, and
   * this — so the marker it is closed with is a registry the others can adopt
   * rather than another single-caller patch.
   */
  it('refuses a change made mid-dispatch, and the argv, the stamp and the transcript agree', async () => {
    const [first, second] = queueChildren(2)

    const session = createSession({
      model: 'fable',
      effort: 'high',
      name: 'dispatch window',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    playTurn(first, 'claude-conversation-4')
    await waitForIdle(session.id)

    // Deliberately not awaited: this is the window, one await wide.
    const dispatch = service.sendMessage(session.id, { text: 'carry on' })

    expect(() =>
      service.setModelSelection(session.id, {
        providerId: 'claude-code',
        model: 'opus',
        effort: 'medium',
      }),
    ).toThrow(/already on its way to the provider/)

    await dispatch
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    playTurn(second, 'claude-conversation-4')
    await waitFor(() => {
      expect(turnCapture.listTurns(session.id)).toHaveLength(2)
    })

    // The three readings of the same turn, and the row behind them.
    expect(flagValue(spawnArgs(1), '--model')).toBe('fable')
    expect(flagValue(spawnArgs(1), '--effort')).toBe('high')
    expect(turnCapture.listTurns(session.id)[1].model).toBe('fable')
    expect(modelChangeNotes(session.id)).toEqual([])
    expect(service.getById(session.id)?.model).toBe('fable')
  })

  /**
   * A session that never changes model shows nothing — no placeholder, no
   * empty state. Re-selecting the model already in force is not a change.
   */
  it('renders no boundary for a session that never changes model', async () => {
    const [first] = queueChildren(1)

    const session = createSession({
      model: 'opus',
      effort: 'high',
      name: 'steady',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    playTurn(first, 'claude-conversation-3')
    await waitForIdle(session.id)

    service.setModelSelection(session.id, {
      providerId: 'claude-code',
      model: 'opus',
      effort: 'max',
    })

    expect(modelChangeNotes(session.id)).toEqual([])
  })
})
