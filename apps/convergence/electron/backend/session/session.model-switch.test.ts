import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionService } from './session.service'

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
 * Proof that a mid-conversation model change reaches the model (MAR-2550).
 *
 * Everything here is read back off the Claude adapter rather than off the
 * session row: the argv Convergence handed the binary, and the context state
 * the adapter derived from the process's own output. Asserting that the row
 * says `opus` would only prove that the write landed, which increment 1
 * already pins — it would say nothing about the turn the human is about to
 * watch.
 *
 * The Claude adapter is the right witness because it spawns a fresh process
 * for every turn (`--resume <conversation>` plus `--model`), so the argv of
 * turn two is a complete statement of what turn two is: which conversation,
 * which model, which effort.
 */
describe('a session changes model mid-conversation (MAR-2550)', () => {
  let service: SessionService
  let tempDir: string
  let projectId: string
  let db: Database.Database

  beforeEach(() => {
    db = getDatabase()
    const registry = new ProviderRegistry()
    registry.register(new ClaudeCodeProvider('/usr/local/bin/claude'))

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-model-switch-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))

    service = new SessionService(
      db,
      new LocalExecutionHost(registry),
      join(tempDir, 'global-sessions'),
    )

    projectId = 'model-switch-project'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'test', ?)",
    ).run(projectId, repoPath)
  })

  afterEach(() => {
    spawnMock.mockReset()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function queueChildren(count: number): MockChildProcess[] {
    const children = Array.from({ length: count }, () => new MockChildProcess())
    children.forEach((child) => spawnMock.mockReturnValueOnce(child))
    return children
  }

  /**
   * Plays a whole Claude turn out of the fake process: the conversation id it
   * is working under, one assistant message carrying token usage, and the
   * result that ends the turn.
   */
  function playTurn(
    child: MockChildProcess,
    input: { conversationId: string; usageModel?: string | null },
  ): void {
    child.stdout.write(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: input.conversationId,
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        type: 'assistant',
        message: {
          ...(input.usageModel ? { model: input.usageModel } : {}),
          content: [{ type: 'text', text: 'ack' }],
          usage: {
            input_tokens: 40_000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
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

  /**
   * Marcin's own case: a long Fable conversation, Fable runs out, carry on as
   * Opus without losing the thread.
   */
  it('spawns the next turn on the new model, resuming the same conversation', async () => {
    const [first, second] = queueChildren(2)

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'fable',
      effort: 'high',
      name: 'quota switch',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    expect(flagValue(spawnArgs(0), '--model')).toBe('fable')
    expect(flagValue(spawnArgs(0), '--effort')).toBe('high')
    expect(spawnArgs(0)).not.toContain('--resume')

    playTurn(first, { conversationId: 'claude-conversation-1' })
    await waitForIdle(session.id)

    service.setModelSelection(session.id, {
      providerId: 'claude-code',
      model: 'opus',
      effort: 'medium',
    })

    await service.sendMessage(session.id, { text: 'carry on' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    // The whole feature in three lines: the same conversation, a different
    // model, a different effort.
    expect(flagValue(spawnArgs(1), '--resume')).toBe('claude-conversation-1')
    expect(flagValue(spawnArgs(1), '--model')).toBe('opus')
    expect(flagValue(spawnArgs(1), '--effort')).toBe('medium')

    playTurn(second, { conversationId: 'claude-conversation-1' })
  })

  it('spawns the next turn on the new effort when only effort changed', async () => {
    const [first, second] = queueChildren(2)

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'opus',
      effort: 'low',
      name: 'effort switch',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(flagValue(spawnArgs(0), '--effort')).toBe('low')

    playTurn(first, { conversationId: 'claude-conversation-2' })
    await waitForIdle(session.id)

    service.setModelSelection(session.id, {
      providerId: 'claude-code',
      model: 'opus',
      effort: 'max',
    })

    await service.sendMessage(session.id, { text: 'think harder' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    expect(flagValue(spawnArgs(1), '--resume')).toBe('claude-conversation-2')
    expect(flagValue(spawnArgs(1), '--model')).toBe('opus')
    expect(flagValue(spawnArgs(1), '--effort')).toBe('max')

    playTurn(second, { conversationId: 'claude-conversation-2' })
  })

  /**
   * The watch item. The context meter's window tier is derived from the model
   * (`deriveClaudeModelContextWindow`), so a switch between tiers must move
   * the meter or the session would report a fraction of a window it no longer
   * has. Fable is a 1M tier; plain `sonnet` is a 200k one.
   *
   * This is the reading that matters in practice: Claude names the concrete
   * model on its own assistant messages, and that name is what the meter
   * tiers from. That the stream outranks anything Convergence told it is
   * pinned separately in `context-window.pure.test.ts`.
   */
  it('re-tiers the context meter from the model the provider reports', async () => {
    const [first, second] = queueChildren(2)

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'fable',
      effort: 'high',
      name: 'meter follows the switch',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    playTurn(first, {
      conversationId: 'claude-conversation-3',
      usageModel: 'claude-fable-5',
    })
    await waitForIdle(session.id)

    expect(service.getById(session.id)?.contextWindow).toMatchObject({
      availability: 'available',
      windowTokens: 1_000_000,
      usedTokens: 40_000,
      usedPercentage: 4,
    })

    service.setModelSelection(session.id, {
      providerId: 'claude-code',
      model: 'sonnet',
      effort: 'medium',
    })

    await service.sendMessage(session.id, { text: 'carry on' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    playTurn(second, {
      conversationId: 'claude-conversation-3',
      usageModel: 'claude-sonnet-4-5',
    })

    await waitFor(() => {
      expect(service.getById(session.id)?.contextWindow).toMatchObject({
        availability: 'available',
        windowTokens: 200_000,
        usedTokens: 40_000,
        usedPercentage: 20,
      })
    })
  })

  /**
   * And when Claude does not name a model on the event — partial messages and
   * some result shapes carry usage without one — the adapter falls back to the
   * model of the handle it is running under. That handle is built per turn
   * from the row, so the fallback moves with the switch too. Without this the
   * meter could keep a stale tier for a whole turn.
   */
  it('re-tiers the context meter from the new selection when the stream names no model', async () => {
    const [first, second] = queueChildren(2)

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'fable',
      effort: 'high',
      name: 'meter fallback follows the switch',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    playTurn(first, { conversationId: 'claude-conversation-4' })
    await waitForIdle(session.id)

    expect(service.getById(session.id)?.contextWindow).toMatchObject({
      windowTokens: 1_000_000,
    })

    service.setModelSelection(session.id, {
      providerId: 'claude-code',
      model: 'sonnet',
      effort: 'medium',
    })

    await service.sendMessage(session.id, { text: 'carry on' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    playTurn(second, { conversationId: 'claude-conversation-4' })

    await waitFor(() => {
      expect(service.getById(session.id)?.contextWindow).toMatchObject({
        windowTokens: 200_000,
      })
    })
  })

  /**
   * The refusal, proved where it counts. Increment 1 pins that the write is
   * rejected; this pins that the turn the human is watching is untouched —
   * a process already spawned closed over the config it started with, and no
   * argument reaches it afterwards.
   */
  it('refuses a switch while a turn is running, and the running turn is unchanged', async () => {
    const [first] = queueChildren(1)

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'fable',
      effort: 'high',
      name: 'mid-turn refusal',
    })

    await service.start(session.id, { text: 'begin' })
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    expect(() =>
      service.setModelSelection(session.id, {
        providerId: 'claude-code',
        model: 'opus',
        effort: 'medium',
      }),
    ).toThrow(/only change while the session is idle/)

    expect(flagValue(spawnArgs(0), '--model')).toBe('fable')
    expect(spawnMock).toHaveBeenCalledTimes(1)

    playTurn(first, { conversationId: 'claude-conversation-5' })
  })
})
