import { performance } from 'node:perf_hooks'
import { serialize } from 'node:v8'
import type Database from 'better-sqlite3'

export type ConversationReadTiming = {
  sessionId: string
  selectMs: number
  parseMs: number
  replyBytes: number
}
let conversationObserver: ((sample: ConversationReadTiming) => void) | undefined

export function recordConversationRead(
  sessionId: string,
  selectMs: number,
  parseMs: number,
  items: unknown,
): void {
  conversationObserver?.({
    sessionId,
    selectMs,
    parseMs,
    replyBytes: serialize(items).byteLength,
  })
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
  private readonly timers = new Map<string, Cost & { ticks: number }>()
  private readonly statements = new Map<string, Cost>()
  private readonly summary: Cost = { calls: 0, totalMs: 0, maxMs: 0 }
  private renderer: unknown = null

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
    conversationObserver = (sample) => this.conversationReads.push(sample)
    this.undo.push(() => {
      conversationObserver = previous
    })
  }

  wrapSend(target: { send: Send }): void {
    const original = target.send
    const { channels, measure } = this
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
      // V8-serialized payload bytes: a reproducible proxy, not Electron wire size.
      try {
        cost.bytes += serialize(args).byteLength
      } catch {
        /* Some Electron-transferable values are not V8 serializable. */
      }
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
    const { statements, measure } = this
    db.prepare = function (this: Database.Database, sql: string) {
      const statement = original.call(this, sql)
      for (const method of ['run', 'get', 'all'] as const) {
        const execute = statement[method]
        const cost = statements.get(sql) ?? {
          calls: 0,
          totalMs: 0,
          maxMs: 0,
        }
        statements.set(sql, cost)
        statement[method] = function (...args: unknown[]) {
          return measure(cost, () => Reflect.apply(execute, this, args))
        }
      }
      return statement
    } as typeof db.prepare
    this.undo.push(() => {
      db.prepare = original
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
        }
        timers.set(name, cost)
        return original(
          function (this: unknown, ...values: unknown[]) {
            cost.ticks++
            return measure(cost, () => callback.apply(this, values))
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
    const elapsedSeconds = (performance.now() - this.startedAt) / 1000
    return {
      elapsedSeconds,
      main: {
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
        timers: Object.fromEntries(this.timers),
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
    for (const undo of this.undo.splice(0).reverse()) undo()
  }
}

export function createPerfProbe(enabled: boolean): PerfProbe | null {
  if (!enabled) return null
  return new PerfProbe()
}
