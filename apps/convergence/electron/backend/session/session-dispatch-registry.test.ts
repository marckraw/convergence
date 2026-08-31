import { describe, expect, it } from 'vitest'
import { SessionDispatchRegistry } from './session-dispatch-registry'

describe('SessionDispatchRegistry (MAR-2550)', () => {
  it('reports nothing in flight for a session that has not sent', () => {
    const registry = new SessionDispatchRegistry()

    expect(registry.isDispatching('session-1')).toBe(false)
  })

  it('reports a session as dispatching between begin and settle', () => {
    const registry = new SessionDispatchRegistry()

    const dispatch = registry.begin('session-1')
    expect(registry.isDispatching('session-1')).toBe(true)

    registry.settle(dispatch)
    expect(registry.isDispatching('session-1')).toBe(false)
  })

  /**
   * The reason this is a registry and not a boolean. A session can have a send
   * in flight while another one settles -- the relay opener and its payload are
   * exactly that shape -- and the first settle must not report the session idle
   * while the second send is still on its way to a provider.
   */
  it('stays dispatching until the last send of a session settles', () => {
    const registry = new SessionDispatchRegistry()

    const first = registry.begin('session-1')
    const second = registry.begin('session-1')

    registry.settle(first)
    expect(registry.isDispatching('session-1')).toBe(true)

    registry.settle(second)
    expect(registry.isDispatching('session-1')).toBe(false)
  })

  it('keeps one session out of another session answer', () => {
    const registry = new SessionDispatchRegistry()

    const dispatch = registry.begin('session-1')

    expect(registry.isDispatching('session-2')).toBe(false)
    registry.settle(dispatch)
    expect(registry.isDispatching('session-1')).toBe(false)
  })

  it('ignores a second settle of the same send', () => {
    const registry = new SessionDispatchRegistry()

    const first = registry.begin('session-1')
    const second = registry.begin('session-1')

    registry.settle(first)
    registry.settle(first)

    expect(registry.isDispatching('session-1')).toBe(true)
    registry.settle(second)
    expect(registry.isDispatching('session-1')).toBe(false)
  })
})
