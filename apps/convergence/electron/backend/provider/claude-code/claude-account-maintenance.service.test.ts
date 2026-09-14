import { describe, expect, it, vi } from 'vitest'
import { ClaudeAccountMaintenance } from './claude-account-maintenance.service'

describe('Claude account maintenance admission', () => {
  it('refuses a preparing turn without changing credentials or closing residents', async () => {
    const service = new ClaudeAccountMaintenance()
    const release = service.acquire('a')
    const work = vi.fn()
    await expect(service.run('a', work)).rejects.toThrow(/active/)
    expect(work).not.toHaveBeenCalled()
    release()
    release()
    await service.run('a', async () => 'done')
  })

  it('does not close any residents when a sibling is busy', async () => {
    const service = new ClaudeAccountMaintenance()
    const closeIdle = vi.fn(async () => {})
    service.register('a', { isBusy: () => false, endIdle: closeIdle })
    service.register('a', { isBusy: () => true, endIdle: closeIdle })
    await expect(service.run('a', async () => {})).rejects.toThrow(/active/)
    expect(closeIdle).not.toHaveBeenCalled()
  })

  it('holds admission through exit and mutation while allowing other accounts', async () => {
    const service = new ClaudeAccountMaintenance()
    let finishClose!: () => void
    const closing = new Promise<void>((resolve) => {
      finishClose = resolve
    })
    const closeIdle = vi.fn(() => closing)
    service.register('a', { isBusy: () => false, endIdle: closeIdle })
    const work = vi.fn(async () => {
      expect(() => service.acquire('a')).toThrow(/being updated/)
      return 'updated'
    })
    const pending = service.run('a', work)
    expect(work).not.toHaveBeenCalled()
    expect(() => service.acquire('a')).toThrow(/being updated/)
    await expect(service.run('a', async () => {})).rejects.toThrow(
      /being updated/,
    )
    service.acquire('b')()
    finishClose()
    expect(await pending).toBe('updated')
    service.acquire('a')()
  })

  it('never mutates after an unconfirmed close and reopens admission on failure', async () => {
    const service = new ClaudeAccountMaintenance()
    service.register('a', {
      isBusy: () => false,
      endIdle: async () => {
        throw new Error('exit unconfirmed')
      },
    })
    const work = vi.fn()
    await expect(service.run('a', work)).rejects.toThrow('exit unconfirmed')
    expect(work).not.toHaveBeenCalled()
    service.acquire('a')()
  })
})
