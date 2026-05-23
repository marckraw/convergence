import type { ChildProcess } from 'child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectOpenService } from './project-open.service'
import type { ProjectOpenServiceDeps } from './project-open.service'

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn(),
  },
}))

type ExecFileFn = NonNullable<ProjectOpenServiceDeps['execFile']>

function makeChildProcess(kill = vi.fn()): ChildProcess {
  return { kill } as unknown as ChildProcess
}

describe('ProjectOpenService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats an empty shell.openPath result as Finder success', async () => {
    const openPath = vi.fn().mockResolvedValue('')
    const service = new ProjectOpenService({
      exists: () => true,
      openPath,
    })

    await expect(
      service.open({ appId: 'finder', path: '/repo' }),
    ).resolves.toBeUndefined()
    expect(openPath).toHaveBeenCalledWith('/repo')
  })

  it('throws the shell.openPath error message when Finder fails', async () => {
    const service = new ProjectOpenService({
      exists: () => true,
      openPath: vi.fn().mockResolvedValue('No application can open this path'),
    })

    await expect(
      service.open({ appId: 'finder', path: '/repo' }),
    ).rejects.toThrow('No application can open this path')
  })

  it('validates unknown app ids before opening', async () => {
    const service = new ProjectOpenService({
      exists: () => true,
      openPath: vi.fn().mockResolvedValue(''),
    })

    await expect(
      service.open({ appId: 'unknown' as never, path: '/repo' }),
    ).rejects.toThrow(
      'Unknown project open app: unknown. Available: cursor, vscode, zed, webstorm, finder',
    )
  })

  it('reuses the cached app scan when opening after listing apps', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    const execFile: ExecFileFn = (file, args, callback) => {
      calls.push({ file, args })
      queueMicrotask(() => callback(null, '', ''))
      return makeChildProcess()
    }

    const service = new ProjectOpenService({
      platform: 'darwin',
      exists: () => true,
      execFile,
      openPath: vi.fn().mockResolvedValue(''),
      now: () => 1000,
    })

    await service.listApps()
    await service.open({ appId: 'cursor', path: '/repo' })

    const mdfindCalls = calls.filter((call) => call.file === '/usr/bin/mdfind')
    const openCalls = calls.filter((call) => call.file === '/usr/bin/open')
    expect(mdfindCalls).toHaveLength(5)
    expect(openCalls).toEqual([
      {
        file: '/usr/bin/open',
        args: ['-a', 'Cursor', '/repo'],
      },
    ])
  })

  it('refreshes the app scan after the cache expires', async () => {
    let now = 1000
    const calls: Array<{ file: string; args: string[] }> = []
    const execFile: ExecFileFn = (file, args, callback) => {
      calls.push({ file, args })
      queueMicrotask(() => callback(null, '', ''))
      return makeChildProcess()
    }

    const service = new ProjectOpenService({
      platform: 'darwin',
      exists: () => true,
      execFile,
      openPath: vi.fn().mockResolvedValue(''),
      now: () => now,
      appCacheTtlMs: 100,
    })

    await service.listApps()
    now = 1101
    await service.listApps()

    expect(
      calls.filter((call) => call.file === '/usr/bin/mdfind'),
    ).toHaveLength(10)
  })

  it('times out slow Spotlight lookups and kills the child process', async () => {
    const kill = vi.fn()
    const execFile: ExecFileFn = () => makeChildProcess(kill)
    const service = new ProjectOpenService({
      platform: 'darwin',
      exists: () => false,
      execFile,
      openPath: vi.fn().mockResolvedValue(''),
      mdfindTimeoutMs: 1,
    })

    await expect(service.listApps()).resolves.toEqual([
      { id: 'finder', label: 'Finder', kind: 'file-manager' },
    ])
    expect(kill).toHaveBeenCalled()
  })
})
