import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentMeterService } from './agent-meter.service'
import { MeterProcessSource } from './process-source'

describe('agent meter sampler', () => {
  let meter: AgentMeterService
  const readProcesses = vi.fn<() => Promise<string>>()
  const publish = vi.fn()
  const appUsage = vi.fn(() => ({ cpu: 12, memoryMb: 900 }))
  beforeEach(() => {
    vi.useFakeTimers()
    readProcesses
      .mockReset()
      .mockResolvedValue('10 1 3 10240\n11 10 7 20480\n20 1 5 30720')
    publish.mockReset()
    meter = new AgentMeterService({ readProcesses, publish, appUsage })
  })
  afterEach(() => {
    meter.dispose()
    vi.useRealTimers()
  })
  const flush = () => vi.advanceTimersByTimeAsync(0)

  it('R2 has no timer at boot; first pid starts one; last exit clears it', async () => {
    expect(vi.getTimerCount()).toBe(0)
    const source = new MeterProcessSource()
    meter.attach('a', source)
    expect(vi.getTimerCount()).toBe(0)
    const root = source.set(10)
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    source.clear(root)
    expect(vi.getTimerCount()).toBe(0)
    expect(meter.snapshot().rows).toEqual([])
  })
  it('R3 executes one process table read per tick for many conversations', async () => {
    const a = new MeterProcessSource()
    a.set(10)
    const b = new MeterProcessSource()
    b.set(20)
    meter.attach('a', a)
    meter.attach('b', b)
    await flush()
    readProcesses.mockClear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(readProcesses).toHaveBeenCalledTimes(1)
    expect(meter.snapshot().agents).toEqual({ cpu: 15, memoryMb: 60 })
  })
  it('counts a shared Codex server once and labels both conversations', async () => {
    const source = new MeterProcessSource('Work')
    source.set(10)
    meter.attach('a', source)
    meter.attach('b', source)
    await vi.advanceTimersByTimeAsync(5000)
    expect(meter.snapshot().agents).toEqual({ cpu: 10, memoryMb: 30 })
    expect(meter.snapshot().rows).toHaveLength(2)
    expect(meter.snapshot().rows.every((row) => row.account === 'Work')).toBe(
      true,
    )
  })
  it.each(['failure', 'timeout'])(
    'R5 %s publishes unavailable and recovers on the next tick',
    async (message) => {
      readProcesses.mockRejectedValueOnce(new Error(message))
      const source = new MeterProcessSource()
      source.set(10)
      meter.attach('a', source)
      await flush()
      expect(meter.snapshot().agents).toBeNull()
      expect(meter.snapshot().rows[0].usage).toBeNull()
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(5000)
      expect(meter.snapshot().rows[0].usage).toEqual({ cpu: 10, memoryMb: 30 })
    },
  )
  it('meters the shared server after its handle is released until the server exits', async () => {
    const source = new MeterProcessSource('Work')
    const root = source.set(10)
    meter.attach('a', source)
    await flush()
    meter.attach('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(meter.snapshot().rows[0].account).toBe('Work')
    expect(vi.getTimerCount()).toBe(1)
    source.clear(root)
    expect(vi.getTimerCount()).toBe(0)
    expect(meter.snapshot().rows).toEqual([])
  })
  it('does not publish changes below rounding', async () => {
    const source = new MeterProcessSource()
    source.set(10)
    meter.attach('a', source)
    await flush()
    publish.mockClear()
    readProcesses.mockResolvedValue('10 1 10.1 31000')
    await vi.advanceTimersByTimeAsync(5000)
    expect(publish).not.toHaveBeenCalled()
  })
  it('stops polling when the table proves the last root gone', async () => {
    const source = new MeterProcessSource()
    source.set(99)
    meter.attach('a', source)
    await flush()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('ignores an in-flight sample after release and prevents overlapping reads', async () => {
    let resolve!: (table: string) => void
    readProcesses.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const source = new MeterProcessSource()
    source.set(10)
    meter.attach('a', source)
    await vi.advanceTimersByTimeAsync(10000)
    expect(readProcesses).toHaveBeenCalledTimes(1)
    meter.attach('a')
    resolve('10 1 99 99999')
    await flush()
    expect(meter.snapshot().rows).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
  it('R1 clears the exited process lease even when its numeric pid is reused', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 10 }) as ChildProcess
    const source = new MeterProcessSource()
    meter.attach('a', source)
    source.bind(child)
    await flush()
    child.emit('exit', 0, null)
    readProcesses.mockResolvedValue('10 1 90 99999')
    await vi.advanceTimersByTimeAsync(5000)
    expect(source.current()).toBeNull()
    expect(meter.snapshot().rows).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
  it('a late old-process exit cannot erase the replacement lease', () => {
    const old = Object.assign(new EventEmitter(), { pid: 10 }) as ChildProcess
    const next = Object.assign(new EventEmitter(), { pid: 20 }) as ChildProcess
    const source = new MeterProcessSource()
    source.bind(old)
    source.bind(next)
    old.emit('exit', 0, null)
    expect(source.current()?.pid).toBe(20)
  })
})
