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
import { BlockSentenceAttemptRepository } from './block-sentence-attempt.repository'
import { BlockSentenceRepository } from './block-sentence.repository'
import { BlockSentenceService } from './block-sentence.service'

/**
 * The real recording path (MAR-3395 R2, superseded by MAR-3422 CV3d on
 * Marcin's word): a session records a turn through a provider's own emitter;
 * the sentence service asks for a block as soon as a boundary closes it, and
 * hears the turn end once, for what is left.
 */
describe('sentences are asked for when a block closes, and at turn end for what is left', () => {
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
      attempts: new BlockSentenceAttemptRepository(db),
      turnItems: (id, turnId) => sessions.getTurnConversation(id, turnId),
      turnItemsSince: (id, turnId, after) =>
        sessions.getTurnConversationSince(id, turnId, after),
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
    sessions.setTurnItemRecordedListener(({ sessionId, turnId, item }) =>
      sentences.itemRecorded(sessionId, turnId, item),
    )
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

  it('asks for a block when a boundary closes it, and for the trailing block when the turn ends', async () => {
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
    const trailingFirst = turn.addToolCall({
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

    // The turn is still running: the closed block is asked for, the
    // trailing one is not.
    await sentences.whenIdle()
    expect(turnClosed).not.toHaveBeenCalled()
    expect(oneShot).toHaveBeenCalledTimes(1)
    expect(
      repository
        .list(sessionId)
        .map((row) => [row.firstItemId, row.lastItemId]),
    ).toEqual([[first, last]])

    turn.patchSession({ status: 'completed' })
    await sentences.whenIdle()

    expect(turnClosed).toHaveBeenCalledTimes(1)
    expect(oneShot).toHaveBeenCalledTimes(2)
    const stored = repository.list(sessionId)
    // `list` orders by the wall clock; two rows can share a millisecond.
    expect(stored.map((row) => row.firstItemId).sort()).toEqual(
      [first, trailingFirst].sort(),
    )
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

describe('a block is asked for when it closes (MAR-3422 CV3d)', () => {
  let dir: string
  let sessions: SessionService
  let turnCapture: TurnCaptureService
  let sentences: BlockSentenceService
  let repository: BlockSentenceRepository
  let attempts: BlockSentenceAttemptRepository
  let sessionId: string
  let answers: Array<string | Error>
  const oneShot = vi.fn(async (_input: OneShotInput) => {
    const next = answers.shift() ?? 'Read three files under src.'
    if (next instanceof Error) throw next
    return { text: next }
  })
  let turnItemsSince: ReturnType<
    typeof vi.fn<SessionService['getTurnConversationSince']>
  >

  beforeEach(() => {
    oneShot.mockClear()
    answers = []
    dir = mkdtempSync(join(tmpdir(), 'block-sentence-close-'))
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
      name: 'block close',
    }).id
    repository = new BlockSentenceRepository(db)
    attempts = new BlockSentenceAttemptRepository(db)
    turnItemsSince = vi.fn((id: string, turnId: string, after: number) =>
      sessions.getTurnConversationSince(id, turnId, after),
    )
    sentences = new BlockSentenceService({
      repository,
      attempts,
      turnItems: (id, turnId) => sessions.getTurnConversation(id, turnId),
      turnItemsSince,
      isTurnActive: (id, turnId) => sessions.isTurnActive(id, turnId),
      isEnabled: () => true,
      model: () => ({ oneShot }),
      workingDirectory: () => dir,
      promptText: BLOCK_SENTENCE_PROMPT,
      onChanged: () => {},
    })
    sessions.setTurnClosedListener((event) =>
      sentences.turnEnded(event.sessionId, event.turnId),
    )
    sessions.setTurnItemRecordedListener(({ sessionId, turnId, item }) =>
      sentences.itemRecorded(sessionId, turnId, item),
    )
  })

  afterEach(async () => {
    await sentences.whenIdle()
    await sessions.disposeAll()
    await turnCapture.flushPendingEnd(sessionId)
    closeDatabase()
    resetDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  function emitter() {
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
        ).applyDelta(sessionId, delta, source),
    })
  }

  function startTurn() {
    const turn = emitter()
    turn.patchSession({ status: 'running' })
    turn.addUserMessage({ text: 'look around' })
    const turnId = sessions.getConversation(sessionId)[0]!.turnId!
    return { turn, turnId }
  }

  /** Three reads with their results; returns the first and last member. */
  function threeReads(turn: ProviderSessionEmitter, folder = 'src') {
    const ids: string[] = []
    for (const name of ['a', 'b', 'c']) {
      const call = turn.addToolCall({
        toolName: 'Read',
        inputText: JSON.stringify({ file_path: `${folder}/${name}.ts` }),
      })
      ids.push(
        call,
        turn.addToolResult({
          toolName: 'Read',
          relatedItemId: call,
          outputText: 'ok',
        }),
      )
    }
    return { first: ids[0]!, last: ids.at(-1)! }
  }

  it('R1: the line for a closed block lands while its turn is still running', async () => {
    const { turn, turnId } = startTurn()
    const block = threeReads(turn)
    turn.addAssistantMessage({ text: 'Looked.', state: 'complete' })
    await sentences.whenIdle()

    expect(sessions.isTurnActive(sessionId, turnId)).toBe(true)
    expect(
      repository
        .list(sessionId)
        .map((row) => [row.firstItemId, row.lastItemId]),
    ).toEqual([[block.first, block.last]])
    turn.patchSession({ status: 'completed' })
  })

  it('R1: thinking closes nothing; the request waits for a boundary', async () => {
    const { turn } = startTurn()
    threeReads(turn)
    turn.addThinking({ text: 'hmm' })
    await sentences.whenIdle()
    expect(oneShot).not.toHaveBeenCalled()

    turn.addAssistantMessage({ text: 'Looked.', state: 'complete' })
    await sentences.whenIdle()
    expect(oneShot).toHaveBeenCalledTimes(1)
    turn.patchSession({ status: 'completed' })
  })

  it('R4: the insert path reads nothing; the fold runs after it returns', async () => {
    const { turn } = startTurn()
    await sentences.whenIdle()
    turnItemsSince.mockClear()
    threeReads(turn)
    turn.addAssistantMessage({ text: 'Looked.', state: 'complete' })
    expect(turnItemsSince).not.toHaveBeenCalled()
    await sentences.whenIdle()
    expect(turnItemsSince).toHaveBeenCalledTimes(1)
    turn.patchSession({ status: 'completed' })
  })

  it('R2: a kept line and a refused line are not asked again; the trailing block lands after the turn ends', async () => {
    answers = ['Read three files under src.', 'Read src/secrets.ts.']
    const { turn, turnId } = startTurn()
    const kept = threeReads(turn)
    turn.addAssistantMessage({ text: 'One.', state: 'complete' })
    const refused = threeReads(turn, 'lib')
    turn.addAssistantMessage({ text: 'Two.', state: 'complete' })
    const trailing = threeReads(turn)
    await sentences.whenIdle()

    expect(sessions.isTurnActive(sessionId, turnId)).toBe(true)
    expect(oneShot).toHaveBeenCalledTimes(2)
    expect(repository.list(sessionId).map((row) => row.firstItemId)).toEqual([
      kept.first,
    ])

    turn.patchSession({ status: 'completed' })
    await sentences.whenIdle()

    expect(oneShot).toHaveBeenCalledTimes(3)
    expect(
      repository
        .list(sessionId)
        .map((row) => row.firstItemId)
        .sort(),
    ).toEqual([kept.first, trailing.first].sort())
    expect(
      attempts
        .list(sessionId)
        .map((row) => [row.firstItemId, row.trigger, row.outcome]),
    ).toEqual([
      [kept.first, 'block-closed', 'stored'],
      [refused.first, 'block-closed', 'refused'],
      [trailing.first, 'turn-ended', 'stored'],
    ])
  })

  it('R4: on a turn of 2,000 items, each boundary reads only what it has not folded', async () => {
    const { turn } = startTurn()
    await sentences.whenIdle()
    turnItemsSince.mockClear()
    const rowsRead: number[] = []
    turnItemsSince.mockImplementation((id, turnId, after) => {
      const rows = sessions.getTurnConversationSince(id, turnId, after)
      rowsRead.push(rows.length)
      return rows
    })
    const perBoundaryMs: number[] = []
    for (let group = 0; group < 200; group += 1) {
      for (let step = 0; step < 9; step += 1)
        turn.addToolCall({
          toolName: 'Read',
          inputText: JSON.stringify({ file_path: `src/g${group}/${step}.ts` }),
        })
      turn.addAssistantMessage({ text: `Group ${group}.`, state: 'complete' })
      const started = performance.now()
      await sentences.whenIdle()
      perBoundaryMs.push(performance.now() - started)
    }

    // Nine reads since the last boundary, plus the boundary itself.
    expect(rowsRead).toHaveLength(200)
    expect(Math.max(...rowsRead)).toBeLessThanOrEqual(10)
    expect(oneShot).toHaveBeenCalledTimes(20)
    if (process.env.CV3D_REPORT_TIMING) {
      const sorted = [...perBoundaryMs].sort((a, b) => a - b)
      process.stderr.write(
        `per-boundary: median ${sorted[100]!.toFixed(2)} ms, p95 ${sorted[190]!.toFixed(2)} ms, max ${sorted[199]!.toFixed(2)} ms\n`,
      )
    }
    turn.patchSession({ status: 'completed' })
  })
})
