import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { usePerfProbe, usePerfSessionsIdentity } from './usePerfProbe'

const flag = vi.hoisted(() => ({ enabled: false, refs: 0 }))
vi.mock('./perf.api', () => ({ perfApi: { isEnabled: () => flag.enabled } }))
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return {
    ...react,
    useRef: (...args: Parameters<typeof react.useRef>) => {
      flag.refs++
      return react.useRef(...args)
    },
  }
})
const observers: {
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}[] = []
class Observer {
  observe = vi.fn()
  disconnect = vi.fn()
  constructor() {
    observers.push(this)
  }
}
function Probe() {
  usePerfProbe()
  return null
}
function Identity({ sessions }: { sessions: unknown }) {
  usePerfSessionsIdentity(sessions)
  return null
}

describe('renderer probe flag and lifecycle', () => {
  beforeEach(() => {
    flag.enabled = false
    flag.refs = 0
    observers.length = 0
    vi.stubGlobal('PerformanceObserver', Observer)
  })
  afterEach(() => vi.unstubAllGlobals())
  it('registers exactly longtask and event and disconnects both on unmount', () => {
    flag.enabled = true
    const view = render(<Probe />)
    expect(observers).toHaveLength(2)
    expect(observers.map((o) => o.observe.mock.calls[0]?.[0])).toEqual([
      { type: 'longtask', buffered: true },
      { type: 'event', buffered: true, durationThreshold: 16 },
    ])
    view.unmount()
    expect(observers.map((o) => o.disconnect.mock.calls.length)).toEqual([1, 1])
  })
  it('registers nothing when off', () => {
    render(<Probe />)
    expect(observers).toHaveLength(0)
  })
  it('mounts no sessions identity ref when off, including subsequent renders', () => {
    const view = render(<Identity sessions={[]} />)
    view.rerender(<Identity sessions={[]} />)
    expect(flag.refs).toBe(0)
  })
  it('observes identities with a ref when on', () => {
    flag.enabled = true
    const view = render(<Identity sessions={[]} />)
    view.rerender(<Identity sessions={[]} />)
    expect(flag.refs).toBe(2)
  })
})
