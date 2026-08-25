import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerIpcHandlers } from './ipc'
import type { TurnCaptureService } from '../backend/session/turn/turn-capture.service'

/**
 * The canary for the main half of `turns:getFileDiff` (MAR-2589).
 *
 * The renderer's tests and the preload bridge canary both stop at
 * `ipcRenderer.invoke`. Delete the repository argument from the handler in
 * `ipc.ts` and every one of them stays green while the service answers by turn
 * and path alone — which is the lookup that returns whichever repository's row
 * comes first. So this registers the real handlers with stub services, takes
 * the function `ipcMain.handle` was given, and calls it.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
  dialog: {},
  BrowserWindow: { getAllWindows: () => [] },
  shell: {},
}))

/**
 * `registerIpcHandlers` takes its collaborators positionally, and only two of
 * them are reachable from this channel: the session service, whose listeners
 * are wired at registration time, and the turn capture service the handler
 * calls. The rest are placeholders. A signature change that moves either of
 * the two fails this test loudly rather than quietly registering nothing.
 */
const SESSION_SERVICE_ARGUMENT = 12
const TURN_CAPTURE_SERVICE_ARGUMENT = 22
const ARGUMENT_COUNT = 24

function registerWithTurnCapture(
  getFileDiff: TurnCaptureService['getFileDiff'],
): void {
  const noop = (): void => {}
  const args = Array.from({ length: ARGUMENT_COUNT }, () => ({}) as never)
  args[SESSION_SERVICE_ARGUMENT] = {
    setSummaryUpdateListener: noop,
    setConversationPatchListener: noop,
    setQueuedInputPatchListener: noop,
    setTurnDeltaListener: noop,
  } as never
  args[TURN_CAPTURE_SERVICE_ARGUMENT] = { getFileDiff } as never
  ;(registerIpcHandlers as (...values: never[]) => void)(...args)
}

describe('the turns:getFileDiff ipc handler (MAR-2589)', () => {
  beforeEach(() => {
    handlers.clear()
  })

  it('hands the repository the renderer named to the service', async () => {
    const getFileDiff = vi.fn().mockReturnValue('api readme diff')
    registerWithTurnCapture(getFileDiff)

    const handler = handlers.get('turns:getFileDiff')
    expect(handler).toBeTypeOf('function')

    const diff = await handler?.({}, 'turn-1', 'README.md', 'apps/api')

    expect(getFileDiff).toHaveBeenCalledWith('turn-1', 'README.md', 'apps/api')
    expect(diff).toBe('api readme diff')
  })

  it('hands the working-directory root across as null, not as nothing', async () => {
    const getFileDiff = vi.fn().mockReturnValue('root readme diff')
    registerWithTurnCapture(getFileDiff)

    await handlers.get('turns:getFileDiff')?.({}, 'turn-1', 'README.md', null)

    // null is a repository — the working-directory root — and the service
    // folds it to '' the way the identity index does. undefined would ask a
    // different question, by turn and path alone.
    expect(getFileDiff).toHaveBeenCalledWith('turn-1', 'README.md', null)
  })
})
