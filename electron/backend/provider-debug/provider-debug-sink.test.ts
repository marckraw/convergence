import { describe, expect, it, vi } from 'vitest'
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

  /**
   * The no-throw contract belongs to the interface, so it holds for every sink
   * and not only for the one the app happens to build (MAR-2694 round 2). This
   * one's default writer is `process.stderr.write`, which throws on a closed or
   * broken pipe -- and its callers are the same fire-and-forget paths, where a
   * throw skips the work being described.
   *
   * Mutation: call `writeLine(serializeEntry(entry))` directly in
   * `createConsoleDebugSink` and this goes red.
   */
  it('consoleDebugSink does not throw when its writer does', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sink = createConsoleDebugSink(() => {
      throw new Error('broken pipe')
    })

    expect(() => sink.record(ENTRY)).not.toThrow()
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
