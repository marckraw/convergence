import { serializeEntry } from './provider-debug.pure'
import type { ProviderDebugEntry } from './provider-debug.types'

export interface ProviderDebugSink {
  record(entry: ProviderDebugEntry): void
}

export const noopDebugSink: ProviderDebugSink = {
  record() {
    // intentionally empty
  },
}

export function createConsoleDebugSink(
  writeLine: (line: string) => void = (line) =>
    process.stderr.write(`[provider-debug] ${line}\n`),
): ProviderDebugSink {
  return {
    record(entry) {
      writeLine(serializeEntry(entry))
    },
  }
}
