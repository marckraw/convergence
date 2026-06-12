import { describe, expect, it, vi } from 'vitest'
import { ensureCcusageBinaryExecutable } from './claude-quota.service'

describe('ensureCcusageBinaryExecutable', () => {
  it('marks the resolved native ccusage binary executable when it lacks execute bits', () => {
    const chmod = vi.fn()

    ensureCcusageBinaryExecutable('/app/node_modules/@ccusage/bin/ccusage', {
      chmod,
      platform: 'darwin',
      stat: () => ({ mode: 0o100644 }),
    })

    expect(chmod).toHaveBeenCalledWith(
      '/app/node_modules/@ccusage/bin/ccusage',
      0o755,
    )
  })

  it('keeps existing executable native binaries unchanged', () => {
    const chmod = vi.fn()

    ensureCcusageBinaryExecutable('/app/node_modules/@ccusage/bin/ccusage', {
      chmod,
      platform: 'darwin',
      stat: () => ({ mode: 0o100755 }),
    })

    expect(chmod).not.toHaveBeenCalled()
  })

  it('does not chmod the PATH fallback command', () => {
    const chmod = vi.fn()
    const stat = vi.fn()

    ensureCcusageBinaryExecutable('ccusage', {
      chmod,
      platform: 'darwin',
      stat,
    })

    expect(stat).not.toHaveBeenCalled()
    expect(chmod).not.toHaveBeenCalled()
  })

  it('does not chmod Windows binaries', () => {
    const chmod = vi.fn()
    const stat = vi.fn()

    ensureCcusageBinaryExecutable('C:\\app\\ccusage.exe', {
      chmod,
      platform: 'win32',
      stat,
    })

    expect(stat).not.toHaveBeenCalled()
    expect(chmod).not.toHaveBeenCalled()
  })

  it('reports chmod failures with ccusage context', () => {
    expect(() =>
      ensureCcusageBinaryExecutable('/app/node_modules/@ccusage/bin/ccusage', {
        chmod: () => {
          throw new Error('EACCES')
        },
        platform: 'darwin',
        stat: () => ({ mode: 0o100644 }),
      }),
    ).toThrow('ccusage native binary is not executable: EACCES')
  })
})
