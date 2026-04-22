import { describe, expect, it, vi } from 'vitest'
import {
  DockBadgeService,
  formatDockBadgeCount,
} from './notifications.dock-badge'

describe('formatDockBadgeCount', () => {
  it('returns empty string for zero or negative', () => {
    expect(formatDockBadgeCount(0)).toBe('')
    expect(formatDockBadgeCount(-3)).toBe('')
  })

  it('returns the literal count up to nine', () => {
    expect(formatDockBadgeCount(1)).toBe('1')
    expect(formatDockBadgeCount(9)).toBe('9')
  })

  it('returns 9+ for ten or more', () => {
    expect(formatDockBadgeCount(10)).toBe('9+')
    expect(formatDockBadgeCount(42)).toBe('9+')
  })
})

describe('DockBadgeService', () => {
  it('increments and writes the formatted count', () => {
    const setBadge = vi.fn()
    const service = new DockBadgeService({ setBadge })

    service.increment()
    service.increment()
    service.increment()

    expect(setBadge).toHaveBeenNthCalledWith(1, '1')
    expect(setBadge).toHaveBeenNthCalledWith(2, '2')
    expect(setBadge).toHaveBeenNthCalledWith(3, '3')
    expect(service.getCount()).toBe(3)
  })

  it('clear zeroes the counter and writes empty', () => {
    const setBadge = vi.fn()
    const service = new DockBadgeService({ setBadge })

    service.increment()
    service.increment()
    setBadge.mockClear()

    service.clear()

    expect(setBadge).toHaveBeenCalledWith('')
    expect(service.getCount()).toBe(0)
  })

  it('clear is a no-op when count is already zero', () => {
    const setBadge = vi.fn()
    const service = new DockBadgeService({ setBadge })

    service.clear()

    expect(setBadge).not.toHaveBeenCalled()
  })

  it('caps the badge text at 9+ but keeps the real count', () => {
    const setBadge = vi.fn()
    const service = new DockBadgeService({ setBadge })

    for (let i = 0; i < 12; i++) service.increment()

    expect(setBadge).toHaveBeenLastCalledWith('9+')
    expect(service.getCount()).toBe(12)
  })
})
