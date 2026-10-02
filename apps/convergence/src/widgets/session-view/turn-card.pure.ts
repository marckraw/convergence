import type { TurnFileChange, TurnStatus } from '@/entities/turn'

/** The lines a turn added and removed, across every file it changed. */
export function sumTurnFileCounts(
  changes: readonly Pick<TurnFileChange, 'additions' | 'deletions'>[],
): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const change of changes) {
    additions += change.additions
    deletions += change.deletions
  }
  return { additions, deletions }
}

/**
 * What a turn card says about its files (CONV-30): how many it changed, or,
 * with none, whether that is because it is still working or because it
 * changed nothing.
 */
export function turnFileLabel(status: TurnStatus, fileCount: number): string {
  if (fileCount === 0) return status === 'running' ? 'working…' : 'no changes'
  return `${fileCount} file${fileCount === 1 ? '' : 's'}`
}
