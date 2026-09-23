import type { MergeReading } from '../../../src/shared/types/release.types'
import type { WorkLedgerEntry } from '../work-ledger/work-ledger.types'

export function mergeVerdict(reading: MergeReading): string {
  if (reading.mergeCommit) return `merged ${reading.mergeCommit.slice(0, 7)}`
  if (reading.mergeStateStatus !== 'CLEAN')
    return `not CLEAN: ${reading.mergeStateStatus}`
  if (reading.verify === 'missing') return 'verify missing'
  if (reading.verify !== 'SUCCESS') return `verify ${reading.verify}`
  if (!/^[a-f0-9]{40}$/i.test(reading.headSha)) return 'head SHA missing'
  return 'mergeable'
}

/** First wave appearance, then row order: the same ordered ledger Now reads. */
export function reviewedByWave(
  entries: readonly WorkLedgerEntry[],
): WorkLedgerEntry[] {
  const waves = new Map<string | null, WorkLedgerEntry[]>()
  for (const entry of entries) {
    if (entry.state !== 'reviewed' || entry.blocked || !entry.pr) continue
    const rows = waves.get(entry.wave) ?? []
    rows.push(entry)
    waves.set(entry.wave, rows)
  }
  return [...waves.values()].flat()
}
