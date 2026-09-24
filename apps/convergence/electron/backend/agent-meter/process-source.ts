import type { ChildProcess } from 'child_process'

export interface MeterRoot {
  pid: number
}

/** Observer: process lifetime changes wake the meter without idle polling. */
export class MeterProcessSource {
  private root: MeterRoot | null = null
  private listeners = new Set<() => void>()

  constructor(readonly account: string | null = null) {}

  current(): MeterRoot | null {
    return this.root
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(pid: number | undefined): MeterRoot | null {
    this.root = pid === undefined ? null : { pid }
    this.notify()
    return this.root
  }

  clear(root: MeterRoot | null): void {
    if (this.root !== root) return
    this.root = null
    this.notify()
  }

  bind(child: ChildProcess): void {
    const root = this.set(child.pid)
    child.once('exit', () => this.clear(root))
    child.once('error', () => this.clear(root))
  }

  private notify(): void {
    for (const listener of this.listeners) {
      // Diagnostics must never propagate into provider lifecycle callbacks.
      try {
        listener()
      } catch {
        /* The next lifetime event can retry. */
      }
    }
  }
}
