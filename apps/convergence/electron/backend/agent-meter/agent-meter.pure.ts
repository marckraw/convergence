import type { MeterUsage } from '../../../src/shared/types/agent-meter.types'

export interface MeterProcessRow {
  pid: number
  ppid: number
  cpu: number
  rss: number
}

export function parseMeterProcessTable(table: string): MeterProcessRow[] {
  return table
    .trim()
    .split('\n')
    .flatMap((line) => {
      const [pid, ppid, cpu, rss] = line.trim().split(/\s+/).map(Number)
      return [pid, ppid, cpu, rss].every(Number.isFinite) &&
        pid > 0 &&
        cpu >= 0 &&
        rss >= 0
        ? [{ pid, ppid, cpu, rss }]
        : []
    })
}

/** Sum each live root's tree; null roots are expired leases, even if a PID is reused. */
export function meterFromProcessTable(
  rows: MeterProcessRow[],
  roots: (number | null)[],
): (MeterUsage | null)[] {
  const byPid = new Map(rows.map((row) => [row.pid, row]))
  const children = new Map<number, number[]>()
  for (const row of rows)
    children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid])
  return roots.map((root) => {
    if (root === null || !byPid.has(root)) return null
    const seen = new Set<number>()
    const queue = [root]
    let cpu = 0
    let memoryMb = 0
    while (queue.length) {
      const pid = queue.pop()!
      if (seen.has(pid)) continue
      seen.add(pid)
      const row = byPid.get(pid)!
      cpu += row.cpu
      memoryMb += row.rss / 1024
      queue.push(...(children.get(pid) ?? []))
    }
    return { cpu, memoryMb }
  })
}

export function roundMeterUsage(usage: MeterUsage): MeterUsage {
  return {
    cpu: Math.round(usage.cpu),
    memoryMb: Math.round(usage.memoryMb / 10) * 10,
  }
}

export function totalMeterUsage(values: MeterUsage[]): MeterUsage {
  return values.reduce(
    (total, value) => ({
      cpu: total.cpu + value.cpu,
      memoryMb: total.memoryMb + value.memoryMb,
    }),
    { cpu: 0, memoryMb: 0 },
  )
}
