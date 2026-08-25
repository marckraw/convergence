import { describe, expect, it, vi, beforeEach } from 'vitest'
import { turnsApi } from './turn.api'
import type { Turn, TurnDelta, TurnFileChange } from './turn.types'

describe('turnsApi', () => {
  let listForSession: ReturnType<typeof vi.fn>
  let getFileChanges: ReturnType<typeof vi.fn>
  let getFileDiff: ReturnType<typeof vi.fn>
  let onTurnDelta: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listForSession = vi.fn().mockResolvedValue([])
    getFileChanges = vi.fn().mockResolvedValue([])
    getFileDiff = vi.fn().mockResolvedValue('')
    onTurnDelta = vi.fn().mockReturnValue(() => {})

    Object.defineProperty(window, 'electronAPI', {
      value: {
        turns: { listForSession, getFileChanges, getFileDiff, onTurnDelta },
      },
      configurable: true,
    })
  })

  it('forwards listForSession to the preload bridge', async () => {
    const turns: Turn[] = [
      {
        id: 't1',
        sessionId: 's1',
        sequence: 1,
        startedAt: '2026-04-23T00:00:00.000Z',
        endedAt: null,
        status: 'running',
        summary: null,
        providerAccountId: null,
        model: 'opus',
        effort: 'high',
      },
    ]
    listForSession.mockResolvedValue(turns)

    const result = await turnsApi.listForSession('s1')

    expect(listForSession).toHaveBeenCalledWith('s1')
    expect(result).toEqual(turns)
  })

  it('forwards getFileChanges to the preload bridge', async () => {
    const changes: TurnFileChange[] = [
      {
        id: 'c1',
        sessionId: 's1',
        turnId: 't1',
        repoRoot: null,
        filePath: 'a.ts',
        oldPath: null,
        status: 'added',
        additions: 3,
        deletions: 0,
        diff: 'diff text',
        truncated: false,
        binary: false,
        createdAt: '2026-04-23T00:00:00.000Z',
      },
    ]
    getFileChanges.mockResolvedValue(changes)

    const result = await turnsApi.getFileChanges('t1')

    expect(getFileChanges).toHaveBeenCalledWith('t1')
    expect(result).toEqual(changes)
  })

  it('carries the repository a diff belongs to across the preload bridge', async () => {
    getFileDiff.mockResolvedValue('api readme diff')
    const result = await turnsApi.getFileDiff('t1', 'README.md', 'apps/api')

    // The repository is half of a change's identity (MAR-2589); dropped here,
    // the main process answers with whichever repository's row it finds first.
    expect(getFileDiff).toHaveBeenCalledWith('t1', 'README.md', 'apps/api')
    expect(result).toBe('api readme diff')
  })

  it('carries the working-directory root as null rather than as nothing', async () => {
    await turnsApi.getFileDiff('t1', 'README.md', null)

    expect(getFileDiff).toHaveBeenCalledWith('t1', 'README.md', null)
  })

  it('forwards getFileDiff to the preload bridge', async () => {
    getFileDiff.mockResolvedValue('unified diff body')
    const result = await turnsApi.getFileDiff('t1', 'a.ts')

    expect(getFileDiff).toHaveBeenCalledWith('t1', 'a.ts', undefined)
    expect(result).toBe('unified diff body')
  })

  it('subscribes to turn deltas and returns an unsubscribe fn', () => {
    const unsubscribe = vi.fn()
    onTurnDelta.mockReturnValue(unsubscribe)
    const handler = vi.fn()

    const returned = turnsApi.onTurnDelta(handler)

    expect(onTurnDelta).toHaveBeenCalledTimes(1)
    const innerHandler = onTurnDelta.mock.calls[0][0] as (p: unknown) => void

    const delta: TurnDelta = {
      kind: 'turn.add',
      sessionId: 's1',
      turn: {
        id: 't1',
        sessionId: 's1',
        sequence: 1,
        startedAt: '2026-04-23T00:00:00.000Z',
        endedAt: null,
        status: 'running',
        summary: null,
        providerAccountId: null,
        model: 'opus',
        effort: 'high',
      },
    }
    innerHandler(delta)
    expect(handler).toHaveBeenCalledWith(delta)

    returned()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
