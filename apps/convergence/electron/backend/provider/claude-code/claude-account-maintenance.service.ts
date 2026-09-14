export interface ClaudeAccountResident {
  isBusy(): boolean
  endIdle(): Promise<void>
}

/** Admission gate: account maintenance owns the namespace until idle residents
 * have exited and credential IO has finished. Every Claude spawn takes a lease
 * before its first await, so a reconnect cannot race a preparing turn. */
export class ClaudeAccountMaintenance {
  private readonly maintenance = new Set<string>()
  private readonly leases = new Map<string, number>()
  private readonly residents = new Map<ClaudeAccountResident, string>()

  assertAvailable(key: string | null): void {
    if (key && this.maintenance.has(key)) {
      throw new Error(
        'This Claude account is being updated. Try again when it finishes. Your message was not sent.',
      )
    }
  }

  acquire(key: string | null): () => void {
    this.assertAvailable(key)
    if (!key) return () => {}
    this.leases.set(key, (this.leases.get(key) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const remaining = (this.leases.get(key) ?? 1) - 1
      if (remaining) this.leases.set(key, remaining)
      else this.leases.delete(key)
    }
  }

  /** Reserve synchronously before the caller yields to preparation. */
  async admit(accountId: string | null): Promise<() => void> {
    return this.acquire(accountId)
  }

  register(
    accountId: string | null,
    resident: ClaudeAccountResident,
  ): () => void {
    if (!accountId) return () => {}
    this.residents.set(resident, accountId)
    return () => {
      this.residents.delete(resident)
    }
  }

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    this.assertAvailable(key)
    this.maintenance.add(key)
    try {
      const residents = [...this.residents]
        .filter(([, id]) => id === key)
        .map(([resident]) => resident)
      if (this.leases.has(key) || residents.some((r) => r.isBusy())) {
        throw new Error(
          'This Claude account still has active or unconfirmed work. Let it settle before reconnecting or removing it. No credentials were changed.',
        )
      }
      for (const resident of residents) await resident.endIdle()
      return await work()
    } finally {
      this.maintenance.delete(key)
    }
  }
}
