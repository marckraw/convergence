import { execFile } from 'child_process'
import type {
  AgentMeterSnapshot,
  MeterUsage,
} from '../../../src/shared/types/agent-meter.types'
import { MeterProcessSource, type MeterRoot } from './process-source'
import {
  meterFromProcessTable,
  parseMeterProcessTable,
  roundMeterUsage,
  totalMeterUsage,
} from './agent-meter.pure'

export function readMeterProcesses(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'ps',
      ['-A', '-o', 'pid,ppid,%cpu,rss'],
      { timeout: 4000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      },
    )
  })
}

/** One app-wide sampler; providers expose lifetimes and never await diagnostics. */
export class AgentMeterService {
  private sources = new Map<
    string,
    { source: MeterProcessSource; unsubscribe: () => void; released: boolean }
  >()
  private missing = new Set<MeterRoot>()
  private timer: ReturnType<typeof setInterval> | undefined
  private sampling = false
  private disposed = false
  private value: AgentMeterSnapshot = {
    agents: { cpu: 0, memoryMb: 0 },
    convergence: null,
    rows: [],
  }

  constructor(
    private readonly deps: {
      readProcesses?: () => Promise<string>
      appUsage: () => MeterUsage
      publish: (snapshot: AgentMeterSnapshot) => void
    },
  ) {}

  snapshot(): AgentMeterSnapshot {
    return this.value
  }

  attach(sessionId: string, source?: MeterProcessSource): void {
    const previous = this.sources.get(sessionId)
    // A shared account server outlives a settled conversation's handle.
    if (!source && previous?.source.account && previous.source.current()) {
      previous.released = true
      return
    }
    previous?.unsubscribe()
    this.sources.delete(sessionId)
    if (source && !this.disposed)
      this.sources.set(sessionId, {
        source,
        released: false,
        unsubscribe: source.subscribe(() => this.refresh()),
      })
    this.refresh()
  }

  private roots(): Map<
    string,
    { source: MeterProcessSource; root: MeterRoot }
  > {
    const roots = new Map<
      string,
      { source: MeterProcessSource; root: MeterRoot }
    >()
    for (const [id, { source }] of this.sources) {
      const root = source.current()
      if (root && !this.missing.has(root)) roots.set(id, { source, root })
    }
    return roots
  }

  private refresh(): void {
    for (const [id, entry] of this.sources) {
      if (entry.released && !entry.source.current()) {
        entry.unsubscribe()
        this.sources.delete(id)
      }
    }
    const roots = this.roots()
    // Retain only leases still owned by a source; an old PID can be reused safely.
    const current = new Set(
      [...this.sources.values()].map(({ source }) => source.current()),
    )
    for (const root of this.missing)
      if (!current.has(root)) this.missing.delete(root)
    if (!roots.size || this.disposed) {
      if (this.timer) clearInterval(this.timer)
      this.timer = undefined
      this.publish({
        agents: { cpu: 0, memoryMb: 0 },
        convergence: null,
        rows: [],
      })
    } else if (!this.timer) {
      this.timer = setInterval(() => {
        void this.sample()
      }, 5000)
      this.timer.unref?.()
      void this.sample()
    }
  }

  async sample(): Promise<void> {
    if (this.sampling || this.disposed) return
    const roots = this.roots()
    if (!roots.size) return
    this.sampling = true
    try {
      const table = parseMeterProcessTable(
        await (this.deps.readProcesses ?? readMeterProcesses)(),
      )
      if (this.disposed) return
      const unique = [...new Set([...roots.values()].map(({ root }) => root))]
      const usages = meterFromProcessTable(
        table,
        unique.map((root) => root.pid),
      )
      const byRoot = new Map(unique.map((root, index) => [root, usages[index]]))
      for (const [root, usage] of byRoot) if (!usage) this.missing.add(root)
      // Ignore results for processes replaced or released while ps was in flight.
      const live = [...this.roots()].filter(
        ([id, { root }]) => roots.get(id)?.root === root,
      )
      const totals = [...new Set(live.map(([, { root }]) => root))].flatMap(
        (root) => byRoot.get(root) ?? [],
      )
      this.publish({
        agents: roundMeterUsage(totalMeterUsage(totals)),
        convergence: roundMeterUsage(this.deps.appUsage()),
        rows: live.map(([sessionId, { source, root }]) => ({
          sessionId,
          account: source.account,
          usage: roundMeterUsage(byRoot.get(root)!),
        })),
      })
    } catch {
      if (!this.disposed)
        this.publish({
          agents: null,
          convergence: null,
          rows: [...this.roots()].map(([sessionId, { source }]) => ({
            sessionId,
            account: source.account,
            usage: null,
          })),
        })
    } finally {
      this.sampling = false
      this.refresh()
    }
  }

  private publish(snapshot: AgentMeterSnapshot): void {
    if (JSON.stringify(snapshot) === JSON.stringify(this.value)) return
    this.value = snapshot
    try {
      this.deps.publish(snapshot)
    } catch {
      /* A closing window cannot break a conversation. */
    }
  }

  dispose(): void {
    this.disposed = true
    for (const { unsubscribe } of this.sources.values()) unsubscribe()
    this.sources.clear()
    this.refresh()
  }
}
