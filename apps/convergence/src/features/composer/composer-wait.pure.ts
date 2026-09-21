/**
 * Why a message sent from this composer right now would WAIT (MAR-3288 R6).
 *
 * The backend queues a person's message instead of refusing it while the
 * conversation compacts or a drill holds its queue. The composer says so
 * before anybody types, and the queued row says so after, from the same
 * answer -- so the two cannot disagree about whether there is a wait.
 *
 * The drill wins over a bare compaction: its `compacting` beat IS a
 * compaction, and the drill is the longer wait of the two -- the message
 * goes after the wake-up reply, not after the compaction.
 */
export type ComposerWaitReason = 'drill' | 'compaction'

export function composerWaitReason(input: {
  compacting: boolean
  drillRunning: boolean
}): ComposerWaitReason | null {
  if (input.drillRunning) return 'drill'
  if (input.compacting) return 'compaction'
  return null
}

export const COMPOSER_WAIT_NOTICES: Record<ComposerWaitReason, string> = {
  compaction:
    'Compacting context — messages you send now are queued and delivered after.',
  drill:
    'The drill is running — messages you send now are queued and delivered after.',
}

/** What a waiting row says while there is a wait (MAR-3288 R7). */
export const WAITS_FOR_COMPACTION_LABEL = 'Waits for compaction'
