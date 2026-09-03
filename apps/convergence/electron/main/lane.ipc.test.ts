import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { registerIpcHandlers } from './ipc'

/**
 * The main half of the lane doors (MAR-2783, slice L1).
 *
 * The renderer's tests stub `window.electronAPI` and the service test drives
 * `LaneService` directly, so the wire between `lane:create` and the service --
 * and the progress broadcast that rides beside it -- is visible to no other
 * gate. Delete either handler and every gate stays green while the dialog
 * waits forever. So this registers the real handlers with a stub in every
 * slot, takes what `ipcMain.handle` was given, and calls it.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const sent: Array<[string, unknown]> = []

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: vi.fn(),
  },
  dialog: {},
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => {
            sent.push([channel, payload])
          },
        },
      },
    ],
  },
  shell: { showItemInFolder: vi.fn() },
}))

/**
 * Positional, like every other ipc canary here: the lane service rides right
 * after the workspace service it is the sibling of. Move it and this names
 * the slot that answered instead.
 */
const PROJECT_SERVICE_ARGUMENT = 0
const LANE_SERVICE_ARGUMENT = 4
const SESSION_SERVICE_ARGUMENT = 7
const ARGUMENT_COUNT = 23

type AnyFn = (...args: unknown[]) => unknown

function registerHandlers(
  create: (input: unknown, onProgress: (phase: string) => void) => unknown,
): {
  answered: () => number[]
  listLanes: ReturnType<typeof vi.fn>
} {
  const noop = (): void => {}
  const creates: Array<Mock<AnyFn>> = Array.from(
    { length: ARGUMENT_COUNT },
    (_unused, index) => vi.fn<AnyFn>(() => `the service at argument ${index}`),
  )
  creates[LANE_SERVICE_ARGUMENT] = vi.fn<AnyFn>(create as AnyFn)
  const listLanes = vi.fn(() => ['the lanes'])

  const args = creates.map((fn) => ({ create: fn }) as never)
  args[PROJECT_SERVICE_ARGUMENT] = {
    ...(args[PROJECT_SERVICE_ARGUMENT] as object),
    listLanes,
  } as never
  args[SESSION_SERVICE_ARGUMENT] = {
    ...(args[SESSION_SERVICE_ARGUMENT] as object),
    setSummaryUpdateListener: noop,
    setConversationPatchListener: noop,
    setQueuedInputPatchListener: noop,
    setTurnDeltaListener: noop,
  } as never
  ;(registerIpcHandlers as (...values: never[]) => void)(...args)

  return {
    answered: () =>
      creates.flatMap((fn, index) => (fn.mock.calls.length > 0 ? [index] : [])),
    listLanes,
  }
}

describe('the lane ipc doors (MAR-2783)', () => {
  beforeEach(() => {
    handlers.clear()
    sent.length = 0
  })

  it('hands lane:create to the lane service, and no other argument', async () => {
    const { answered } = registerHandlers(
      async (input: unknown) => `made ${JSON.stringify(input)}`,
    )
    const input = {
      rootProjectId: 'root',
      laneName: 'studio',
      branchName: 'feat/x',
    }

    const result = await handlers.get('lane:create')?.({}, input)

    expect(answered()).toEqual([LANE_SERVICE_ARGUMENT])
    expect(result).toBe(`made ${JSON.stringify(input)}`)
  })

  // L2 (round 3): the door checks the shape; the service never sees a
  // non-string, and the renderer gets a sentence rather than a TypeError.
  it('refuses a lane:create whose fields are not all strings, with one sentence, before the service', async () => {
    const { answered } = registerHandlers(async () => 'made')

    await expect(
      handlers.get('lane:create')?.(
        {},
        { rootProjectId: 'root', laneName: 5, branchName: 'feat/x' },
      ),
    ).rejects.toThrow(
      'Lane creation needs a root project id, a lane name and a branch name, each as text.',
    )
    await expect(handlers.get('lane:create')?.({}, null)).rejects.toThrow(
      /each as text/,
    )

    expect(answered()).toEqual([])
    expect(sent).toEqual([])
  })

  it('broadcasts every progress beat the service reports, named for its lane', async () => {
    registerHandlers(
      async (_input: unknown, onProgress: (phase: string) => void) => {
        onProgress('copying')
        onProgress('done')
        return 'ok'
      },
    )

    await handlers.get('lane:create')?.(
      {},
      { rootProjectId: 'root', laneName: 'studio', branchName: 'b' },
    )

    expect(sent).toEqual([
      [
        'lane:progress',
        { rootProjectId: 'root', laneName: 'studio', phase: 'copying' },
      ],
      [
        'lane:progress',
        { rootProjectId: 'root', laneName: 'studio', phase: 'done' },
      ],
    ])
  })

  it('answers lane:list from the project record, by root', async () => {
    const { listLanes } = registerHandlers(vi.fn())

    const result = await handlers.get('lane:list')?.({}, 'root')

    expect(listLanes).toHaveBeenCalledWith('root')
    expect(result).toEqual(['the lanes'])
  })
})
