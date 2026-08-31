import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
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
 * calls. A signature change that moves either of the two fails this test
 * loudly rather than quietly registering nothing.
 */
const SESSION_SERVICE_ARGUMENT = 6
const TURN_CAPTURE_SERVICE_ARGUMENT = 15
const ARGUMENT_COUNT = 17

interface ArgumentSlot {
  index: number
  getFileDiff: Mock
}

/**
 * Registers the real handlers with a stub in every argument slot, each one
 * able to answer `getFileDiff`.
 *
 * The constants above are the fragile half of this canary. MAR-2609 re-anchored
 * them once already, when excising code review shortened the signature, and a
 * count that still adds up is not evidence that the argument at that index is
 * still the turn capture service — re-anchoring numbers is exactly how a real
 * removal would hide here. So no slot is inert: every one records that it was
 * asked, and the test names the slot that answered. Move the turn capture
 * service to any other position and the handler answers from that position, and
 * this goes red saying which one — instead of raising a `TypeError` off an empty
 * placeholder, which reads like a broken stub rather than a broken wire.
 */
function registerHandlers(
  getFileDiff: TurnCaptureService['getFileDiff'],
): ArgumentSlot[] {
  const noop = (): void => {}
  const slots: ArgumentSlot[] = Array.from(
    { length: ARGUMENT_COUNT },
    (_unused, index) => ({
      index,
      getFileDiff: vi.fn(() => `the service at argument ${index}`),
    }),
  )
  slots[TURN_CAPTURE_SERVICE_ARGUMENT].getFileDiff = vi.fn(
    getFileDiff as (...args: unknown[]) => unknown,
  )

  const args = slots.map((slot) => ({ getFileDiff: slot.getFileDiff }) as never)
  args[SESSION_SERVICE_ARGUMENT] = {
    ...(args[SESSION_SERVICE_ARGUMENT] as object),
    setSummaryUpdateListener: noop,
    setConversationPatchListener: noop,
    setQueuedInputPatchListener: noop,
    setTurnDeltaListener: noop,
  } as never
  ;(registerIpcHandlers as (...values: never[]) => void)(...args)

  return slots
}

function slotsThatAnswered(slots: ArgumentSlot[]): number[] {
  return slots
    .filter((slot) => slot.getFileDiff.mock.calls.length > 0)
    .map((slot) => slot.index)
}

describe('the turns:getFileDiff ipc handler (MAR-2589)', () => {
  beforeEach(() => {
    handlers.clear()
  })

  it('asks the turn capture service, and no other argument', async () => {
    const slots = registerHandlers(vi.fn().mockReturnValue('turn capture diff'))

    const diff = await handlers.get('turns:getFileDiff')?.(
      {},
      'turn-1',
      'README.md',
      null,
    )

    // The identity claim, not the arithmetic one: the object the handler
    // reached for is the object this test put at that index, proven by the
    // answer coming back from it and from nowhere else.
    expect(slotsThatAnswered(slots)).toEqual([TURN_CAPTURE_SERVICE_ARGUMENT])
    expect(diff).toBe('turn capture diff')
  })

  it('hands the repository the renderer named to the service', async () => {
    const getFileDiff = vi.fn().mockReturnValue('api readme diff')
    registerHandlers(getFileDiff)

    const handler = handlers.get('turns:getFileDiff')
    expect(handler).toBeTypeOf('function')

    const diff = await handler?.({}, 'turn-1', 'README.md', 'apps/api')

    expect(getFileDiff).toHaveBeenCalledWith('turn-1', 'README.md', 'apps/api')
    expect(diff).toBe('api readme diff')
  })

  it('hands the working-directory root across as null, not as nothing', async () => {
    const getFileDiff = vi.fn().mockReturnValue('root readme diff')
    registerHandlers(getFileDiff)

    await handlers.get('turns:getFileDiff')?.({}, 'turn-1', 'README.md', null)

    // null is a repository — the working-directory root — and the service
    // folds it to '' the way the identity index does. undefined would ask a
    // different question, by turn and path alone.
    expect(getFileDiff).toHaveBeenCalledWith('turn-1', 'README.md', null)
  })
})
