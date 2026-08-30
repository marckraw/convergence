import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The preload half of the work address (MAR-2689).
 *
 * Two lines, and the only two in the slice no other gate can see. The renderer
 * suites stub `window.electronAPI` and the main suites call the handlers
 * directly, so a bridge that quietly stopped forwarding either of these would
 * leave every one of them green while the strip said "asking…" forever and the
 * send carried no place — a silent absence, which is this codebase's most
 * repeated defect class.
 *
 * `contextBridge.exposeInMainWorld` takes `any`, so the shared `ElectronAPI`
 * declaration does not constrain this file either. Hence a test.
 */

const exposed = new Map<string, Record<string, unknown>>()
const invoke = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => {
      exposed.set(key, api)
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invoke(...args),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
  nativeTheme: { prefersReducedTransparency: false },
}))

async function bridge(): Promise<Record<string, Record<string, unknown>>> {
  await import('./index')
  const api = exposed.get('electronAPI')
  expect(api).toBeDefined()
  return api as Record<string, Record<string, unknown>>
}

describe('the work address bridge', () => {
  beforeEach(() => {
    invoke.mockClear()
  })

  it('asks one named machine where it can work', async () => {
    const api = await bridge()
    const getProjects = api.executionHost.getProjects as (
      id?: string,
    ) => unknown
    getProjects('little-monster')
    expect(invoke).toHaveBeenCalledWith(
      'executionHost:getProjects',
      'little-monster',
    )
  })

  it('reads what a daemon would clone for one named checkout', async () => {
    const api = await bridge()
    const getUrl = api.git.getCloneableRepositoryUrl as (
      path: string,
    ) => unknown
    getUrl('/tmp/project-1')
    expect(invoke).toHaveBeenCalledWith(
      'git:getCloneableRepositoryUrl',
      '/tmp/project-1',
    )
  })

  it('carries the place a new session records', async () => {
    // The bridge builds no object of its own -- it forwards the input whole --
    // so this pins that `workAddress` survives the crossing rather than being
    // dropped by a bridge that names the fields it passes.
    const api = await bridge()
    const create = api.session.create as (input: unknown) => unknown
    const input = {
      providerId: 'claude-code',
      model: null,
      effort: null,
      name: 'session',
      executionHost: 'little-monster',
      workAddress: {
        mode: 'project',
        projectId: 'new-blok',
        workingDirectory: '/srv/projects/new-blok',
        label: 'Project new-blok',
      },
    }
    create(input)
    expect(invoke).toHaveBeenCalledWith('session:create', input)
  })
})
