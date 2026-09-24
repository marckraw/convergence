import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import {
  usePerfProbe,
  usePerfSessionsIdentity,
  markPerfConversationOpen,
  markPerfConversationLoaded,
  conversationPaintSamples,
} from './usePerfProbe'

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
  it('M1b R4 flag off creates no conversation mark or animation frame', () => {
    const mark = vi.fn()
    const frame = vi.fn()
    vi.stubGlobal('performance', { mark, now: () => 0 })
    vi.stubGlobal('requestAnimationFrame', frame)
    markPerfConversationOpen('one')
    markPerfConversationLoaded('one')
    expect(mark).not.toHaveBeenCalled()
    expect(frame).not.toHaveBeenCalled()
  })
  it('M1b opening ends after two frames and discards a superseded open', () => {
    flag.enabled = true
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frames.push(fn)
      return frames.length
    })
    const mark = vi.fn(),
      measure = vi.fn()
    vi.stubGlobal('performance', {
      now: () => 10,
      mark,
      measure,
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
    })
    const before = conversationPaintSamples().length
    markPerfConversationOpen('old')
    markPerfConversationLoaded('old')
    markPerfConversationOpen('target')
    markPerfConversationLoaded('target')
    expect(conversationPaintSamples()).toHaveLength(before)
    frames.splice(0).forEach((fn) => fn(0))
    expect(conversationPaintSamples()).toHaveLength(before)
    frames.splice(0).forEach((fn) => fn(0))
    expect(conversationPaintSamples().slice(before)).toEqual([
      { sessionId: 'target', ms: 0 },
    ])
    expect(measure).toHaveBeenCalledTimes(1)
    expect(mark).toHaveBeenCalledTimes(3)
  })
  it('M1b waits for the snapshot when the invoke acknowledgement arrives first', () => {
    flag.enabled = true
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frames.push(fn)
      return frames.length
    })
    vi.stubGlobal('performance', {
      now: () => 10,
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
    })
    const before = conversationPaintSamples().length
    let landed = false
    markPerfConversationOpen('late-snapshot')
    markPerfConversationLoaded('late-snapshot', () => landed)
    frames.splice(0).forEach((fn) => fn(0))
    frames.splice(0).forEach((fn) => fn(0))
    expect(conversationPaintSamples()).toHaveLength(before)
    landed = true
    frames.splice(0).forEach((fn) => fn(0))
    expect(conversationPaintSamples()).toHaveLength(before)
    frames.splice(0).forEach((fn) => fn(0))
    expect(conversationPaintSamples().slice(before)).toEqual([
      { sessionId: 'late-snapshot', ms: 0 },
    ])
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
