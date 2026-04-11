import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { FakeProvider } from './fake-provider'
import type {
  TranscriptEntry,
  SessionStatus,
  AttentionState,
} from './provider.types'

describe('FakeProvider', () => {
  let provider: FakeProvider

  beforeEach(() => {
    vi.useFakeTimers()
    provider = new FakeProvider()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has correct id and name', () => {
    expect(provider.id).toBe('fake')
    expect(provider.name).toBe('Fake Provider')
  })

  it('emits user message and assistant responses', async () => {
    const entries: TranscriptEntry[] = []
    const handle = provider.start({
      sessionId: 'test-1',
      workingDirectory: '/tmp/repo',
      initialMessage: 'Fix the bug',
    })

    handle.onTranscriptEntry((entry) => entries.push(entry))

    await vi.advanceTimersByTimeAsync(1200)

    expect(entries.length).toBeGreaterThanOrEqual(2)
    expect(entries[0]).toMatchObject({ type: 'user', text: 'Fix the bug' })
    expect(entries[1]).toMatchObject({ type: 'assistant' })
  })

  it('requests approval and waits', async () => {
    const attentions: AttentionState[] = []
    const handle = provider.start({
      sessionId: 'test-2',
      workingDirectory: '/tmp/repo',
      initialMessage: 'Do something',
    })

    handle.onAttentionChange((a) => attentions.push(a))

    await vi.advanceTimersByTimeAsync(2000)

    expect(attentions).toContain('needs-approval')
  })

  it('completes after approval', async () => {
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []
    const handle = provider.start({
      sessionId: 'test-3',
      workingDirectory: '/tmp/repo',
      initialMessage: 'Do something',
    })

    handle.onStatusChange((s) => statuses.push(s))
    handle.onAttentionChange((a) => attentions.push(a))

    await vi.advanceTimersByTimeAsync(2000)
    handle.approve()
    await vi.advanceTimersByTimeAsync(2000)

    expect(statuses).toContain('running')
    expect(statuses).toContain('completed')
    expect(attentions).toContain('finished')
  })

  it('stops cleanly', async () => {
    const statuses: SessionStatus[] = []
    const handle = provider.start({
      sessionId: 'test-4',
      workingDirectory: '/tmp/repo',
      initialMessage: 'Do something',
    })

    handle.onStatusChange((s) => statuses.push(s))

    await vi.advanceTimersByTimeAsync(500)
    handle.stop()
    await vi.advanceTimersByTimeAsync(5000)

    expect(statuses).toContain('failed')
    // No more events after stop
    const countAfterStop = statuses.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(statuses.length).toBe(countAfterStop)
  })

  it('handles deny', async () => {
    const statuses: SessionStatus[] = []
    const handle = provider.start({
      sessionId: 'test-5',
      workingDirectory: '/tmp/repo',
      initialMessage: 'Do something',
    })

    handle.onStatusChange((s) => statuses.push(s))

    await vi.advanceTimersByTimeAsync(2000)
    handle.deny()
    await vi.advanceTimersByTimeAsync(1000)

    expect(statuses).toContain('completed')
  })
})
