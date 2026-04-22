import { describe, expect, it, vi } from 'vitest'
import { FlashFrameService } from './notifications.flash-frame'

describe('FlashFrameService', () => {
  it('flash starts the frame and clearOnFocus stops it', () => {
    const target = { flashFrame: vi.fn() }
    const service = new FlashFrameService(target)

    service.flash()
    service.clearOnFocus()

    expect(target.flashFrame).toHaveBeenNthCalledWith(1, true)
    expect(target.flashFrame).toHaveBeenNthCalledWith(2, false)
  })

  it('clearOnFocus is a no-op when no flash is active', () => {
    const target = { flashFrame: vi.fn() }
    const service = new FlashFrameService(target)

    service.clearOnFocus()

    expect(target.flashFrame).not.toHaveBeenCalled()
  })

  it('does not double-clear on repeated focus events', () => {
    const target = { flashFrame: vi.fn() }
    const service = new FlashFrameService(target)

    service.flash()
    service.clearOnFocus()
    service.clearOnFocus()

    expect(target.flashFrame).toHaveBeenCalledTimes(2)
  })
})
