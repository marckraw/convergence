import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'
import type { SessionSummary } from './session.types'

/**
 * The canary for the speed-tier bridge (MAR-3572), built like MAR-2550's.
 *
 * The composer test mocks the store action and the backend test calls the
 * service directly, so with `session:setServiceTier` deleted from
 * `electron/preload/index.ts` every other suite stays green while a Fast flip
 * does nothing. This one loads the real preload module with `electron`
 * stubbed and drives it through the real store action and the real
 * `sessionApi`: remove the preload line and it dies on a missing function;
 * rename the channel and it dies on the assertion.
 */

const hoisted = vi.hoisted(() => ({
  invoke: vi.fn(),
  exposed: {} as Record<string, unknown>,
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      hoisted.exposed[key] = api
    },
  },
  ipcRenderer: {
    invoke: hoisted.invoke,
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  nativeTheme: { prefersReducedTransparency: false },
}))

const SUMMARY: SessionSummary = {
  id: 'session-1',
  contextKind: 'project',
  projectId: 'project-1',
  workspaceId: null,
  providerId: 'codex',
  model: 'gpt-6.1-sol',
  effort: 'low',
  serviceTier: 'fast',
  permissionConfig: undefined,
  name: 'a fast conversation',
  status: 'completed',
  attention: 'finished',
  activity: null,
  contextWindow: null,
  workingDirectory: '/tmp/project-1',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  executionHost: 'local',
  continuationToken: 'thread-1',
  lastSequence: 0,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:01.000Z',
} as SessionSummary

describe('the session:setServiceTier preload bridge (MAR-3572)', () => {
  beforeEach(async () => {
    hoisted.invoke.mockReset()
    hoisted.invoke.mockResolvedValue(SUMMARY)
    await import('../../../electron/preload/index')
    Object.defineProperty(window, 'electronAPI', {
      value: hoisted.exposed.electronAPI,
      configurable: true,
      writable: true,
    })
  })

  it('is actually exposed on the bridge the preload builds', () => {
    const api = hoisted.exposed.electronAPI as {
      session: Record<string, unknown>
    }
    expect(typeof api.session.setServiceTier).toBe('function')
  })

  it('carries a Fast flip from the store to the real ipc channel', async () => {
    await useSessionStore
      .getState()
      .setSessionServiceTier('session-1', { serviceTier: 'fast' })

    expect(hoisted.invoke).toHaveBeenCalledWith(
      'session:setServiceTier',
      'session-1',
      { serviceTier: 'fast' },
    )
  })

  it('surfaces a backend refusal as a store error rather than swallowing it', async () => {
    hoisted.invoke.mockRejectedValueOnce(
      new Error(
        "A remote conversation's speed can't be changed from this app.",
      ),
    )

    await expect(
      useSessionStore
        .getState()
        .setSessionServiceTier('session-1', { serviceTier: 'default' }),
    ).rejects.toThrow(/speed can't be changed/)

    expect(useSessionStore.getState().error).toMatch(/speed can't be changed/)
  })
})
