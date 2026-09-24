import { performance } from 'node:perf_hooks'
import { serialize } from 'node:v8'
import type Database from 'better-sqlite3'
import type { HarnessEvidenceService } from '../session/harness-evidence.service'
import type { ConversationWireEvent } from '../../../src/shared/types/conversation-item.types'
import { percentile } from '../../../src/shared/lib/perf-marks.pure'

export type ConversationReadTiming = {
  sessionId: string
  selectMs: number
  parseMs: number
  replyBytes: number
}
let conversationObserver:
  | ((sample: ConversationReadTiming, items: unknown) => void)
  | undefined

export function recordConversationRead(
  sessionId: string,
  selectMs: number,
  parseMs: number,
  items: unknown,
): void {
  conversationObserver?.({ sessionId, selectMs, parseMs, replyBytes: 0 }, items)
}

type Cost = { calls: number; totalMs: number; maxMs: number }
type Send = (channel: string, ...args: unknown[]) => void

/** Decorator: observes existing calls without owning their scheduling or results. */
export class PerfProbe {
  private readonly startedAt = performance.now()
  private readonly cpuStart = process.cpuUsage()
  readonly conversationReads: ConversationReadTiming[] = []
  private readonly heapStart = process.memoryUsage().heapUsed
  private readonly undo: Array<() => void> = []
  private readonly channels = new Map<
    string,
    Cost & { sends: number; bytes: number }
  >()
  private readonly timers = new Map<
    string,
    Cost & { ticks: number; samples: number[] }
  >()
  private readonly statements = new Map<string, Cost>()
  private readonly summary: Cost = { calls: 0, totalMs: 0, maxMs: 0 }
  private readonly evidenceApply: Cost = { calls: 0, totalMs: 0, maxMs: 0 }
  private readonly attentionRowReads = { total: 0, notNeeded: 0 }
  private renderer: unknown = null
  private readonly payloadSizes: Array<() => void> = []
  private readonly patchOps = {
    add: 0,
    patch: 0,
    append: 0,
    snapshot: 0,
    'older-page': 0,
  }
  private readonly streamingItems = new Map<
    string,
    { sessionId: string; itemId: string; sends: number }
  >()

  private measure<T>(cost: Cost, fn: () => T): T {
    const start = performance.now()
    try {
      return fn()
    } finally {
      const ms = performance.now() - start
      cost.calls++
      cost.totalMs += ms
      cost.maxMs = Math.max(cost.maxMs, ms)
    }
  }

  observeConversations(): void {
    const previous = conversationObserver
    conversationObserver = (sample, items) => {
      this.conversationReads.push(sample)
      this.payloadSizes.push(() => {
        sample.replyBytes = serialize(items).byteLength
      })
    }
    this.undo.push(() => {
      conversationObserver = previous
    })
  }

  /** The runner calls this only after the measured renderer paint has completed. */
  flushPayloadSizes(): void {
    for (const size of this.payloadSizes.splice(0)) size()
  }

  private recordPatch(
    event: ConversationWireEvent<{ id: string; state: string }>,
  ): void {
    this.patchOps[event.op]++
    if (
      (event.op === 'add' || event.op === 'patch') &&
      event.item.state === 'streaming'
    ) {
      const key = JSON.stringify([event.sessionId, event.item.id])
      const item = this.streamingItems.get(key) ?? {
        sessionId: event.sessionId,
        itemId: event.item.id,
        sends: 0,
      }
      if (event.op === 'patch') item.sends++
      this.streamingItems.set(key, item)
    }
  }

  wrapSend(target: { send: Send }): void {
    const original = target.send
    const recordPatch = this.recordPatch.bind(this)
    const { channels, measure, payloadSizes } = this
    target.send = function (channel, ...args) {
      const cost = channels.get(channel) ?? {
        calls: 0,
        totalMs: 0,
        maxMs: 0,
        sends: 0,
        bytes: 0,
      }
      channels.set(channel, cost)
      cost.sends++
      const event =
        channel === 'session:conversationPatched'
          ? (args[0] as ConversationWireEvent<{ id: string; state: string }>)
          : undefined
      if (event) recordPatch(event)
      const size = () => {
        // V8-serialized payload bytes: a reproducible proxy, not Electron wire size.
        try {
          cost.bytes += serialize(args).byteLength
        } catch {
          /* Some Electron-transferable values are not V8 serializable. */
        }
      }
      // Sending first is insufficient: main-thread sizing can still delay paint.
      // Hold large snapshots until the runner explicitly ends that measurement.
      if (event?.op === 'snapshot' || event?.op === 'older-page')
        payloadSizes.push(size)
      else size()
      return measure(cost, () => original.call(this, channel, ...args))
    }
    this.undo.push(() => {
      target.send = original
    })
  }

  wrapSummary<T extends { getSummaryById: (...args: never[]) => unknown }>(
    target: T,
  ): void {
    const original = target.getSummaryById
    const { summary, measure } = this
    target.getSummaryById = function (...args) {
      return measure(summary, () => original.apply(this, args))
    }
    this.undo.push(() => {
      target.getSummaryById = original
    })
  }

  wrapDatabase(db: Database.Database): void {
    const original = db.prepare
    const { statements, measure, attentionRowReads } = this
    // Use the original prepare so these probe-only classification reads do not
    // inflate the product SQL counters. No reads are added on the guarded path.
    const attention = original.call(
      db,
      'SELECT attention FROM sessions WHERE id = ?',
    )
    db.prepare = function (this: Database.Database, sql: string) {
      const statement = original.call(this, sql)
      const isAttentionRead =
        /FROM\s+session_conversation_items/i.test(sql) &&
        /kind\s+IN\s*\(\s*'approval-request'\s*,\s*'input-request'\s*\)/i.test(
          sql,
        )
      for (const method of ['run', 'get', 'all'] as const) {
        const execute = statement[method]
        const cost = statements.get(sql) ?? {
          calls: 0,
          totalMs: 0,
          maxMs: 0,
        }
        statements.set(sql, cost)
        statement[method] = function (...args: unknown[]) {
          if (isAttentionRead && (method === 'get' || method === 'all')) {
            // Both current request queries bind only session IDs. Count lookup
            // attempts, including attempts that find no request row.
            for (const id of args) {
              const row = Reflect.apply(attention.get, attention, [id]) as
                | { attention: string }
                | undefined
              attentionRowReads.total++
              if (
                row?.attention !== 'needs-approval' &&
                row?.attention !== 'needs-input'
              )
                attentionRowReads.notNeeded++
            }
          }
          return measure(cost, () => Reflect.apply(execute, this, args))
        }
      }
      return statement
    } as typeof db.prepare
    this.undo.push(() => {
      db.prepare = original
    })
  }

  wrapEvidence(target: Pick<HarnessEvidenceService, 'apply'>): void {
    const original = target.apply
    const { evidenceApply, measure } = this
    target.apply = function (...args) {
      return measure(evidenceApply, () => original.apply(this, args))
    }
    this.undo.push(() => {
      target.apply = original
    })
  }

  wrapTimers(): void {
    for (const key of ['setTimeout', 'setInterval'] as const) {
      const original = globalThis[key]
      const { timers, measure } = this
      const wrapped = function (
        callback: (...args: unknown[]) => void,
        delay?: number,
        ...args: unknown[]
      ) {
        const site =
          new Error().stack
            ?.split('\n')
            .slice(2)
            .find((line) => !line.includes('node:'))
            ?.trim() ?? 'unknown'
        const name = `${key}:${delay ?? 0}:${site}`
        const cost = timers.get(name) ?? {
          calls: 0,
          ticks: 0,
          totalMs: 0,
          maxMs: 0,
          samples: [],
        }
        timers.set(name, cost)
        return original(
          function (this: unknown, ...values: unknown[]) {
            cost.ticks++
            const started = performance.now()
            try {
              return measure(cost, () => callback.apply(this, values))
            } finally {
              cost.samples.push(performance.now() - started)
            }
          },
          delay,
          ...args,
        )
      }
      // Preserve Node's timer properties (e.g. promisify.custom) as well as handles.
      Object.assign(wrapped, original)
      Reflect.set(globalThis, key, wrapped)
      this.undo.push(() => {
        Reflect.set(globalThis, key, original)
      })
    }
  }

  report(renderer?: unknown) {
    if (renderer !== undefined) this.renderer = renderer
    this.flushPayloadSizes()
    const elapsedSeconds = (performance.now() - this.startedAt) / 1000
    const items = [...this.streamingItems.values()].map((item) => ({ ...item }))
    const counts = items.map((item) => item.sends)
    return {
      elapsedSeconds,
      main: {
        conversationPatched: {
          byOp: { ...this.patchOps },
          // Counts actual sends across all windows, including zero-patch items.
          fullPatchesWhileStreaming: {
            samples: counts.length,
            min: counts.length ? Math.min(...counts) : 0,
            p50: percentile(counts, 0.5),
            max: counts.length ? Math.max(...counts) : 0,
            items,
          },
        },
        attentionRowReads: { ...this.attentionRowReads },
        evidenceApply: { ...this.evidenceApply },
        cpuPercent: (() => {
          const cpu = process.cpuUsage(this.cpuStart)
          return (cpu.user + cpu.system) / (elapsedSeconds * 10000)
        })(),
        ipc: Object.fromEntries(
          [...this.channels].map(([channel, cost]) => [
            channel,
            {
              ...cost,
              sendsPerSecond: cost.sends / elapsedSeconds,
              bytesPerSecond: cost.bytes / elapsedSeconds,
            },
          ]),
        ),
        timers: Object.fromEntries(
          [...this.timers].map(([name, { samples, ...cost }]) => [
            name,
            { ...cost, p95Ms: percentile(samples, 0.95) },
          ]),
        ),
        getSummaryById: { calls: this.summary.calls, ms: this.summary.totalMs },
        sqlite: [...this.statements]
          .map(([sql, cost]) => ({ sql: sql.slice(0, 240), ...cost }))
          .sort((a, b) => b.totalMs - a.totalMs)
          .slice(0, 10),
        heap: { start: this.heapStart, end: process.memoryUsage().heapUsed },
      },
      renderer: this.renderer,
    }
  }

  dispose(): void {
    this.payloadSizes.length = 0
    for (const undo of this.undo.splice(0).reverse()) undo()
  }
}

export function createPerfProbe(enabled: boolean): PerfProbe | null {
  if (!enabled) return null
  return new PerfProbe()
}
