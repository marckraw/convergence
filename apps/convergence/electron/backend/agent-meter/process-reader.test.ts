import { execFile } from 'child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentMeterService } from './agent-meter.service'
import { MeterProcessSource } from './process-source'

vi.mock('child_process', () => ({ execFile: vi.fn() }))
afterEach(() => vi.useRealTimers())

it('R3 invokes execFile once per tick with an asynchronous bounded ps command', async () => {
  vi.useFakeTimers()
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args[3] as (error: Error | null, stdout: string) => void
    callback(null, '10 1 2 10240\n20 1 3 20480')
    return {} as ReturnType<typeof execFile>
  })
  const meter = new AgentMeterService({
    appUsage: () => ({ cpu: 0, memoryMb: 0 }),
    publish: vi.fn(),
  })
  try {
    for (const pid of [10, 20]) {
      const source = new MeterProcessSource()
      source.set(pid)
      meter.attach(String(pid), source)
    }
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(execFile).mockClear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(execFile).toHaveBeenCalledTimes(1)
    expect(execFile).toHaveBeenCalledWith(
      'ps',
      ['-A', '-o', 'pid,ppid,%cpu,rss'],
      { timeout: 4000, maxBuffer: 4 * 1024 * 1024 },
      expect.any(Function),
    )
  } finally {
    meter.dispose()
  }
})
