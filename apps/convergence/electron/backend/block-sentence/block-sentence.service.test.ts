import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { OneShotInput } from '../provider/provider.types'
import type { ConversationItem } from '../session/conversation-item.types'
import { BLOCK_SENTENCE_PROMPT } from './block-sentence.prompt'
import {
  blockRecordsFromItems,
  buildBlockPrompt,
  LUNA_ONE_SHOT_TIMEOUT_MS,
} from './block-sentence.pure'
import { BlockSentenceService } from './block-sentence.service'
import type {
  BlockSentence,
  BlockSentenceAttempt,
} from './block-sentence.types'

let sequence = 0

function base(id: string, turnId = 't1') {
  sequence += 1
  return {
    id,
    sessionId: 's1',
    sequence,
    turnId,
    state: 'complete' as const,
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'tool-use',
    },
  }
}

function read(id: string, path: string): ConversationItem {
  return {
    ...base(id),
    kind: 'tool-call',
    toolName: 'Read',
    inputText: JSON.stringify({ file_path: path }),
  }
}

function say(id: string): ConversationItem {
  return { ...base(id), kind: 'message', actor: 'assistant', text: 'done' }
}

/** `count` blocks of three reads each, split by the agent speaking. */
function turnWithBlocks(count: number): ConversationItem[] {
  const items: ConversationItem[] = [
    { ...base('user'), kind: 'message', actor: 'user', text: 'go' },
  ]
  for (let block = 0; block < count; block += 1) {
    for (let step = 0; step < 3; step += 1)
      items.push(read(`b${block}-${step}`, `src/b${block}/f${step}.ts`))
    items.push(say(`say-${block}`))
  }
  return items
}

function harness(
  options: {
    items?: ConversationItem[]
    enabled?: () => boolean
    active?: boolean
    available?: () => boolean
    answer?: (input: OneShotInput) => Promise<{ text: string }>
    /** Runs before the row is written; throw to fail the write. */
    beforeInsert?: (row: BlockSentence) => void
  } = {},
) {
  const stored = new Map<string, BlockSentence>()
  let inFlight = 0
  let maxInFlight = 0
  let modelAsked = 0
  const oneShot = vi.fn(async (input: OneShotInput) => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 1))
    inFlight -= 1
    return options.answer
      ? options.answer(input)
      : { text: 'Read three files.' }
  })
  const changed = vi.fn()
  const items = options.items ?? turnWithBlocks(1)
  const turnItems = vi.fn((_sessionId: string, turnId: string) =>
    items.filter((item) => item.turnId === turnId),
  )
  const attempts: BlockSentenceAttempt[] = []
  const service = new BlockSentenceService({
    attempts: {
      insert: (row) => void attempts.push(row),
      hasRefusal: (sessionId, firstItemId) =>
        attempts.some(
          (row) =>
            row.sessionId === sessionId &&
            row.firstItemId === firstItemId &&
            row.outcome === 'refused',
        ),
    },
    turnItemsSince: (_sessionId, turnId, afterSequence) =>
      items.filter(
        (item) => item.turnId === turnId && item.sequence > afterSequence,
      ),
    repository: {
      has: (sessionId, firstItemId) =>
        stored.has(`${sessionId}/${firstItemId}`),
      insert: (row) => {
        options.beforeInsert?.(row)
        const key = `${row.sessionId}/${row.firstItemId}`
        if (stored.has(key)) return false
        stored.set(key, row)
        return true
      },
    },
    turnItems,
    isTurnActive: () => options.active ?? false,
    isEnabled: options.enabled ?? (() => true),
    model: () => {
      modelAsked += 1
      return options.available && !options.available() ? null : { oneShot }
    },
    workingDirectory: () => '/tmp/block-sentence-scratch',
    promptText: BLOCK_SENTENCE_PROMPT,
    onChanged: changed,
    now: () => '2026-09-25T12:00:00.000Z',
    requestId: () => 'req',
  })
  return {
    service,
    oneShot,
    stored,
    changed,
    turnItems,
    attempts,
    maxInFlight: () => maxInFlight,
    modelAsked: () => modelAsked,
  }
}

describe('the prompt main sends is the file the spike reads (A3)', () => {
  it('bundles block-sentence.prompt.txt byte for byte', () => {
    expect(BLOCK_SENTENCE_PROMPT).toBe(
      readFileSync(
        new URL('./block-sentence.prompt.txt', import.meta.url),
        'utf8',
      ),
    )
  })
})

describe('when and how often (R2)', () => {
  it('asks for at most 20 of 25 eligible blocks, one request at a time', async () => {
    const h = harness({ items: turnWithBlocks(25) })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(20)
    expect(h.maxInFlight()).toBe(1)
    expect(h.stored.size).toBe(20)
    expect([...h.stored.values()].map((row) => row.firstItemId)).toEqual(
      Array.from({ length: 20 }, (_, block) => `b${block}-0`),
    )
    expect(h.changed).toHaveBeenCalledTimes(20)
  })

  it('serializes app-wide: two turns ending together still ask one at a time', async () => {
    const items = [
      ...turnWithBlocks(2),
      ...turnWithBlocks(2).map((item) => ({
        ...item,
        id: `other-${item.id}`,
        turnId: 't2',
      })),
    ]
    const h = harness({ items })
    h.service.turnEnded('s1', 't1')
    h.service.turnEnded('s1', 't2')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(4)
    expect(h.maxInFlight()).toBe(1)
  })

  it('asks nothing for a turn that is still running', async () => {
    const h = harness({ active: true })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).not.toHaveBeenCalled()
  })

  it('asks nothing on the caller path: the request starts after turnEnded returns', async () => {
    const h = harness()
    h.service.turnEnded('s1', 't1')
    expect(h.oneShot).not.toHaveBeenCalled()
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
  })

  it('skips blocks under three members and blocks already described', async () => {
    const items: ConversationItem[] = [
      { ...base('user'), kind: 'message', actor: 'user', text: 'go' },
      read('small-0', 'src/a.ts'),
      read('small-1', 'src/b.ts'),
      say('say-small'),
      ...turnWithBlocks(1).slice(1),
    ]
    const h = harness({ items })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
  })
})

describe('the call (A1)', () => {
  it('asks GPT-6 Luna at low effort on the ambient Codex account, read-only, with the spike prompt', async () => {
    const items = turnWithBlocks(1)
    const h = harness({ items })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    const members = items.slice(1, 4)
    expect(h.oneShot).toHaveBeenCalledWith({
      // R11: a `claude-code` session is `claude` in the prompt, as measured.
      prompt: buildBlockPrompt(
        BLOCK_SENTENCE_PROMPT,
        'claude',
        blockRecordsFromItems(members),
      )!.prompt,
      modelId: 'gpt-6-luna',
      effort: 'low',
      workingDirectory: '/tmp/block-sentence-scratch',
      timeoutMs: LUNA_ONE_SHOT_TIMEOUT_MS,
      requestId: 'req',
      providerAccountId: null,
      permissionConfig: {
        preset: 'custom',
        codex: { approvalPolicy: 'never', sandbox: 'read-only' },
      },
    })
  })

  it('asks nothing when the Codex provider cannot take a helper turn', async () => {
    const h = harness({ available: () => false })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).not.toHaveBeenCalled()
    expect(h.turnItems).not.toHaveBeenCalled()
    expect(h.stored.size).toBe(0)
  })

  it('asks nothing more once the Codex provider goes away mid-queue', async () => {
    let available = true
    const h = harness({
      items: turnWithBlocks(5),
      available: () => available,
      answer: async () => {
        available = false
        return { text: 'Read three files.' }
      },
    })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
  })

  it('stops spending on a turn once a call fails', async () => {
    const h = harness({
      items: turnWithBlocks(5),
      answer: async () => {
        throw new Error('not signed in')
      },
    })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
    expect(h.stored.size).toBe(0)
    expect(h.changed).not.toHaveBeenCalled()
  })
})

describe('truth before storage (R3)', () => {
  it('drops a line naming a path outside the block, once, without retrying', async () => {
    const h = harness({
      answer: async () => ({ text: 'Read src/auth/secrets.ts.' }),
    })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
    expect(h.stored.size).toBe(0)
    expect(h.changed).not.toHaveBeenCalled()
  })

  it('keeps a line that names only the block’s own paths', async () => {
    const h = harness({
      answer: async () => ({ text: 'Read three files under src/b0.' }),
    })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect([...h.stored.values()]).toEqual([
      {
        sessionId: 's1',
        firstItemId: 'b0-0',
        lastItemId: 'b0-2',
        sentence: 'Read three files under src/b0.',
        model: 'gpt-6-luna',
        createdAt: '2026-09-25T12:00:00.000Z',
      },
    ])
    expect(h.changed).toHaveBeenCalledWith('s1')
  })
})

describe('his switch (R6, A4)', () => {
  it('Off: no request at all, and the turn is not even read', async () => {
    const h = harness({ enabled: () => false })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).not.toHaveBeenCalled()
    expect(h.turnItems).not.toHaveBeenCalled()
  })

  it('turned Off mid-queue: the next block is not asked', async () => {
    let enabled = true
    const h = harness({
      items: turnWithBlocks(5),
      enabled: () => enabled,
      answer: async () => {
        enabled = false
        return { text: 'Read three files.' }
      },
    })
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
  })
})

/** A settled macrotask: every microtask queued before it has run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('the queue never stalls (R10)', () => {
  it('a write that fails for one turn (its session deleted mid-request) does not drop the turns behind it', async () => {
    const items = [
      ...turnWithBlocks(2),
      ...turnWithBlocks(1).map((item) => ({
        ...item,
        id: `s2-${item.id}`,
        sessionId: 's2',
      })),
    ]
    const h = harness({
      items,
      beforeInsert: (row) => {
        // What SQLite says when the session row is gone: OR IGNORE does not
        // cover a foreign key (the real table: block-sentence.turn-end.test).
        if (row.sessionId === 's1')
          throw new Error('FOREIGN KEY constraint failed')
      },
    })
    h.turnItems.mockImplementation((sessionId: string) =>
      items.filter((item) => item.sessionId === sessionId),
    )
    h.service.turnEnded('s1', 't1')
    h.service.turnEnded('s2', 't1')
    await h.service.whenIdle()

    // s1's first block was asked and failed to store; its turn ends there.
    // s2's block is still asked for, and stored.
    expect(h.oneShot).toHaveBeenCalledTimes(2)
    expect([...h.stored.keys()]).toEqual(['s2/s2-b0-0'])
  })

  it('a turn that ends in the microtask gap as the queue empties is still described', async () => {
    // The gap is a few microtasks wide, between the loop finding the queue
    // empty and the consumer letting go; walk a late turn across it.
    for (let late = 0; late <= 12; late += 1) {
      const items = [
        ...turnWithBlocks(1),
        ...turnWithBlocks(1).map((item) => ({
          ...item,
          id: `t2-${item.id}`,
          turnId: 't2',
        })),
      ]
      let lateTurnEnded!: () => void
      const lateTurnDone = new Promise<void>((resolve) => {
        lateTurnEnded = resolve
      })
      let answered = 0
      const h = harness({
        items,
        answer: async () => {
          answered += 1
          if (answered === 1) {
            void (async () => {
              for (let tick = 0; tick < late; tick += 1) await Promise.resolve()
              h.service.turnEnded('s1', 't2')
              lateTurnEnded()
            })()
          }
          return { text: 'Read three files.' }
        },
      })
      h.service.turnEnded('s1', 't1')
      await lateTurnDone
      await h.service.whenIdle()
      await settle()
      expect(
        h.oneShot,
        `turn ended ${late} microtasks after the answer`,
      ).toHaveBeenCalledTimes(2)
    }
  })
})

describe('quitting stops the queue (R12)', () => {
  it('two queued turns, stopped during the first call: no second request, the model is never asked for again, nothing is stored', async () => {
    // Two blocks in the first turn, so its own next block also meets the
    // stop (the model is not asked for), and a second turn behind it (the
    // queue is dropped: it is not even read).
    const items = [
      ...turnWithBlocks(2),
      ...turnWithBlocks(1).map((item) => ({
        ...item,
        id: `t2-${item.id}`,
        turnId: 't2',
      })),
    ]
    let modelAskedAtStop = -1
    const h = harness({
      items,
      answer: async () => {
        h.service.stop()
        modelAskedAtStop = h.modelAsked()
        return { text: 'Read three files.' }
      },
    })
    h.service.turnEnded('s1', 't1')
    h.service.turnEnded('s1', 't2')
    await h.service.whenIdle()
    await settle()

    expect(h.oneShot).toHaveBeenCalledTimes(1)
    // model() is where a Codex host would be resolved: not once after stop.
    expect(h.modelAsked()).toBe(modelAskedAtStop)
    expect(h.stored.size).toBe(0)
    expect(h.changed).not.toHaveBeenCalled()
    // The second turn was dropped from the queue, never read.
    expect(h.turnItems).toHaveBeenCalledTimes(1)

    // A turn ending during the quit is not even queued.
    h.service.turnEnded('s1', 't1')
    await h.service.whenIdle()
    expect(h.oneShot).toHaveBeenCalledTimes(1)
    expect(h.modelAsked()).toBe(modelAskedAtStop)
  })

  it('main stops the service first thing on before-quit, before sessions or servers close', () => {
    const main = readFileSync(
      new URL('../../main/index.ts', import.meta.url),
      'utf8',
    )
    expect(main).toMatch(
      /app\.on\('before-quit', \(event\) => \{[^}]*?blockSentenceService\.stop\(\)[\s\S]*?sessionService\.disposeAllForQuit\(\)[\s\S]*?codexServerHosts\.stopAll\(\)/,
    )
  })
})
