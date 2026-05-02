import { describe, expect, it } from 'vitest'
import { createConsoleDebugSink, noopDebugSink } from './provider-debug-sink'
import type { ProviderDebugEntry } from './provider-debug.types'

const ENTRY: ProviderDebugEntry = {
  sessionId: 's1',
  providerId: 'codex',
  at: 100,
  direction: 'in',
  channel: 'notification',
  method: 'item/started',
}

describe('provider-debug sinks', () => {
  it('noopDebugSink does nothing', () => {
    expect(() => noopDebugSink.record(ENTRY)).not.toThrow()
  })

  it('consoleDebugSink writes a single JSONL line', () => {
    const lines: string[] = []
    const sink = createConsoleDebugSink((line) => lines.push(line))
    sink.record(ENTRY)
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('\n')
    const parsed = JSON.parse(lines[0]!)
    expect(parsed.method).toBe('item/started')
    expect(parsed.providerId).toBe('codex')
  })
})
