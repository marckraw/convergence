export type PerfRoot = 'composer' | 'sidebar' | 'wave-panel' | 'transcript'

export function percentile(
  values: readonly number[],
  fraction: number,
): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!
}
