import type { TurnFileChange } from '@/entities/turn'

export interface TurnFileChangeNotice {
  kind: 'binary' | 'truncated'
  text: string
}

/**
 * What a stored diff does not say about itself (MAR-2577).
 *
 * A truncated diff is a fragment rendered in a viewer that looks exactly the
 * same as one showing a whole change, and a binary change is a one-line marker
 * rendered as though it were the content. Both are the surface lying by
 * omission, and both are answerable only from the record's own flags — the
 * diff text cannot be trusted to explain itself.
 *
 * Deliberately says neither "by the daemon" nor "by Convergence": the same two
 * flags are set by local capture at its own 200 KB cap and by a remote host at
 * whatever cap it keeps, and a notice that named the wrong cutter would be a
 * second, smaller lie.
 */
export function describeTurnFileChange(
  change: Pick<TurnFileChange, 'truncated' | 'binary'> | null,
): TurnFileChangeNotice[] {
  if (!change) return []

  const notices: TurnFileChangeNotice[] = []
  if (change.binary) {
    notices.push({
      kind: 'binary',
      text: 'Binary file — there is no textual diff to show.',
    })
  }
  if (change.truncated) {
    notices.push({
      kind: 'truncated',
      text: 'Diff truncated — this is a fragment, not the whole change.',
    })
  }
  return notices
}
