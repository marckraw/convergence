import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'
import type { SessionSummary } from './session.types'

/**
 * The canary for the preload bridge (MAR-2550).
 *
 * Every other test in this feature would still pass if
 * `session:setModelSelection` were deleted from `electron/preload/index.ts` —
 * they mock `window.electronAPI` and therefore prove the renderer's half in
 * isolation while the wire is missing. That is silent absence, the same class
 * that let F11 vanish from the session header and the relay bootstrap become a
 * no-op with every suite green.
 *
 * So this test does not mock the bridge. It loads the real preload module with
 * `electron` itself stubbed, captures the object it exposes, installs that as
 * `window.electronAPI`, and drives it through the real store action and the
 * real `sessionApi`. Remove the preload line and this dies on a missing
 * function; change the channel name and it dies on the assertion.
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
  providerId: 'claude-code',
  model: 'opus',
  effort: 'high',
  serviceTier: null,
  permissionConfig: undefined,
  name: 'a long conversation',
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
  continuationToken: 'resume-token-1',
  lastSequence: 0,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:01.000Z',
} as SessionSummary

describe('the session:setModelSelection preload bridge (MAR-2550)', () => {
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
    expect(typeof api.session.setModelSelection).toBe('function')
  })

  it('carries a model change from the store to the real ipc channel', async () => {
    await useSessionStore.getState().setSessionModelSelection('session-1', {
      model: 'opus',
      effort: 'high',
    })

    expect(hoisted.invoke).toHaveBeenCalledWith(
      'session:setModelSelection',
      'session-1',
      { model: 'opus', effort: 'high' },
    )
  })

  it('surfaces a backend refusal as a store error rather than swallowing it', async () => {
    hoisted.invoke.mockRejectedValueOnce(
      new Error(
        'Model and effort can only change while the session is idle. Wait for the current turn to finish.',
      ),
    )

    await expect(
      useSessionStore
        .getState()
        .setSessionModelSelection('session-1', { model: 'opus', effort: null }),
    ).rejects.toThrow(/current turn to finish/)

    // App.container turns this into a toast; a refusal the human cannot see is
    // the exact failure this feature is not allowed to ship.
    expect(useSessionStore.getState().error).toMatch(/current turn to finish/)
  })
})
