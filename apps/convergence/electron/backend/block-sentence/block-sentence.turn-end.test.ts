import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type { OneShotInput, SessionHandle } from '../provider/provider.types'
import { SessionService } from '../session/session.service'
import { TurnCaptureService } from '../session/turn/turn-capture.service'
import { BLOCK_SENTENCE_PROMPT } from './block-sentence.prompt'
import { BlockSentenceRepository } from './block-sentence.repository'
import { BlockSentenceService } from './block-sentence.service'

/**
 * The real turn end (MAR-3395 R2): a session records a turn through a
 * provider's own emitter; the sentence service hears about it once, after
 * the turn closes, and never while items are still arriving.
 */
describe('sentences are asked for when a turn ends, never per item', () => {
  let dir: string
  let sessions: SessionService
  let turnCapture: TurnCaptureService
  let sentences: BlockSentenceService
  let repository: BlockSentenceRepository
  let sessionId: string
  const turnClosed = vi.fn()
  const oneShot = vi.fn(async (_input: OneShotInput) => ({
    text: 'Read three files under src.',
  }))

  beforeEach(() => {
    turnClosed.mockReset()
    oneShot.mockClear()
    dir = mkdtempSync(join(tmpdir(), 'block-sentence-turn-'))
    const repo = join(dir, 'repo')
    mkdirSync(join(repo, '.git'), { recursive: true })
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
    ).run(repo)
    sessions = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(dir, 'global'),
    )
    turnCapture = new TurnCaptureService(new GitService(), db, {
      debounceMs: 0,
    })
    sessions.setTurnCaptureService(turnCapture)
    sessionId = sessions.create({
      projectId: 'p',
      workspaceId: null,
      providerId: 'claude-code',
      model: null,
      effort: null,
      name: 'turn end',
    }).id
    repository = new BlockSentenceRepository(db)
    sentences = new BlockSentenceService({
      repository,
      turnItems: (id, turnId) => sessions.getTurnConversation(id, turnId),
      isTurnActive: (id, turnId) => sessions.isTurnActive(id, turnId),
      isEnabled: () => true,
      model: () => ({ oneShot }),
      workingDirectory: () => dir,
      promptText: BLOCK_SENTENCE_PROMPT,
      onChanged: () => {},
    })
    sessions.setTurnClosedListener((event) => {
      turnClosed(event)
      sentences.turnEnded(event.sessionId, event.turnId)
    })
  })

  afterEach(async () => {
    await sentences.whenIdle()
    await sessions.disposeAll()
    await turnCapture.flushPendingEnd(sessionId)
    closeDatabase()
    resetDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  function emitter(id = sessionId) {
    const source = {
      dispose: vi.fn(),
      stop: vi.fn(),
    } as unknown as SessionHandle
    return new ProviderSessionEmitter({
      providerId: 'claude-code',
      emitDelta: (delta) =>
        (
          sessions as unknown as {
            applyDelta: (id: string, delta: unknown, s: SessionHandle) => void
          }
        ).applyDelta(id, delta, source),
    })
  }

  /** A turn with one closed block of three reads under `dir`. */
  function turnWithOneBlock(id: string, dir: string) {
    const turn = emitter(id)
    turn.patchSession({ status: 'running' })
    turn.addUserMessage({ text: 'look around' })
    for (const name of ['a', 'b', 'c'])
      turn.addToolCall({
        toolName: 'Read',
        inputText: JSON.stringify({ file_path: `${dir}/${name}.ts` }),
      })
    turn.addAssistantMessage({ text: 'Looked.', state: 'complete' })
    return turn
  }

  it('R10: a session deleted while its sentence is asked for does not stall the queue', async () => {
    const other = sessions.create({
      projectId: 'p',
      workspaceId: null,
      providerId: 'claude-code',
      model: null,
      effort: null,
      name: 'the next session',
    }).id
    oneShot.mockImplementationOnce(async () => {
      // The reader's sequence: s1 is deleted mid-request, so the write that
      // follows breaks the foreign key (INSERT OR IGNORE does not cover it).
      sessions.delete(sessionId)
      return { text: 'Read three files under src.' }
    })
    const first = turnWithOneBlock(sessionId, 'src')
    const second = turnWithOneBlock(other, 'src')
    first.patchSession({ status: 'completed' })
    second.patchSession({ status: 'completed' })
    await sentences.whenIdle()

    expect(oneShot).toHaveBeenCalledTimes(2)
    expect(repository.list(sessionId)).toEqual([])
    expect(repository.list(other)).toHaveLength(1)
    await turnCapture.flushPendingEnd(other)
  })

  it('hears the turn once, after it completes, and describes its closed blocks', async () => {
    const turn = emitter()
    turn.patchSession({ status: 'running' })
    turn.addUserMessage({ text: 'look around' })
    const first = turn.addToolCall({
      toolName: 'Read',
      inputText: '{"file_path":"src/a.ts"}',
    })
    turn.addToolCall({
      toolName: 'Read',
      inputText: '{"file_path":"src/b.ts"}',
    })
    const last = turn.addToolCall({
      toolName: 'Read',
      inputText: '{"file_path":"src/c.ts"}',
    })
    turn.addAssistantMessage({ text: 'Looked.', state: 'complete' })
    turn.addToolCall({
      toolName: 'Read',
      inputText: '{"file_path":"src/d.ts"}',
    })
    turn.addToolCall({
      toolName: 'Read',
      inputText: '{"file_path":"src/e.ts"}',
    })
    turn.addToolCall({
      toolName: 'Read',
      inputText: '{"file_path":"src/f.ts"}',
    })

    // Items arrived; the turn is still running: nothing asked.
    await sentences.whenIdle()
    expect(turnClosed).not.toHaveBeenCalled()
    expect(oneShot).not.toHaveBeenCalled()

    turn.patchSession({ status: 'completed' })
    await sentences.whenIdle()

    expect(turnClosed).toHaveBeenCalledTimes(1)
    expect(oneShot).toHaveBeenCalledTimes(2)
    const stored = repository.list(sessionId)
    expect(
      stored.map((row) => [row.firstItemId, row.lastItemId]),
    ).toContainEqual([first, last])
    expect(stored).toHaveLength(2)
    // Never a conversation item: the transcript is exactly what was recorded.
    expect(
      sessions
        .getConversation(sessionId)
        .some(
          (item) =>
            'text' in item && item.text === 'Read three files under src.',
        ),
    ).toBe(false)
  })
})
