import { describe, expect, it, vi } from 'vitest'
import { DockBounceService } from './notifications.dock-bounce'

function createTarget(bounceIds: Array<number | undefined> = [42]) {
  const ids = [...bounceIds]
  return {
    bounce: vi.fn(() => ids.shift()),
    cancelBounce: vi.fn(),
  }
}

describe('DockBounceService', () => {
  it('informational bounce does not retain an id and is not cancelled on focus', () => {
    const target = createTarget([99])
    const service = new DockBounceService(target)

    service.bounceInformational()
    service.cancelOnFocus()

    expect(target.bounce).toHaveBeenCalledWith('informational')
    expect(target.cancelBounce).not.toHaveBeenCalled()
  })

  it('critical bounce stores the id and cancels it on focus', () => {
    const target = createTarget([7])
    const service = new DockBounceService(target)

    service.bounceCritical()
    service.cancelOnFocus()

    expect(target.bounce).toHaveBeenCalledWith('critical')
    expect(target.cancelBounce).toHaveBeenCalledWith(7)
  })

  it('cancelOnFocus is a no-op when no critical bounce is pending', () => {
    const target = createTarget()
    const service = new DockBounceService(target)

    service.cancelOnFocus()

    expect(target.cancelBounce).not.toHaveBeenCalled()
  })

  it('subsequent critical bounces overwrite the tracked id', () => {
    const target = createTarget([1, 2])
    const service = new DockBounceService(target)

    service.bounceCritical()
    service.bounceCritical()
    service.cancelOnFocus()

    expect(target.cancelBounce).toHaveBeenCalledTimes(1)
    expect(target.cancelBounce).toHaveBeenCalledWith(2)
  })

  it('skips storing an id when the platform returns undefined', () => {
    const target = createTarget([undefined])
    const service = new DockBounceService(target)

    service.bounceCritical()
    service.cancelOnFocus()

    expect(target.cancelBounce).not.toHaveBeenCalled()
  })
})
