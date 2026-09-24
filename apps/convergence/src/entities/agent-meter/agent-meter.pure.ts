import type {
  AgentMeterRow,
  MeterUsage,
} from '@/shared/types/agent-meter.types'

export function formatMeterUsage(usage: MeterUsage | null | undefined): string {
  if (!usage) return '—'
  const memory =
    usage.memoryMb >= 1000
      ? `${(usage.memoryMb / 1000).toFixed(1)} GB`
      : `${usage.memoryMb} MB`
  return `${usage.cpu}% · ${memory}`
}

export function formatSessionMeter(
  row: AgentMeterRow | undefined,
  remote: boolean,
): string {
  if (remote) return 'remote'
  return `${formatMeterUsage(row?.usage)}${row?.account ? ` · shared · ${row.account}` : ''}`
}
