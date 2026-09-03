import type {
  ConversationSnapshot,
  ConversationStatus,
  DaemonStatusView,
} from '../../shared/studio-api'

/**
 * What the window says about a conversation (MAR-2770).
 *
 * Everything here is a reading of a snapshot the main process folded out of the
 * event log — never a second opinion about it. The renderer holds no truth of
 * its own, which is why this file is pure and takes the snapshot as an
 * argument.
 */

export interface StatusBadge {
  label: string
  /** The dot's colour, so a state is legible before the word is read. */
  tone: string
}

/**
 * The three states the list shows, and only those (constitution law 5 — the
 * Inbox's seed).
 *
 * `failed` never borrows another state's word or colour: a conversation that
 * broke and one that is waiting for you look completely different at a glance,
 * because they are.
 */
export function statusBadge(status: ConversationStatus): StatusBadge {
  switch (status) {
    case 'running':
      return { label: 'Working', tone: '#5aa9ff' }
    case 'idle':
      return { label: 'Ready for you', tone: '#4ec9a0' }
    case 'failed':
      return { label: 'Failed', tone: '#ff6b6b' }
  }
}

/**
 * The time a list row shows: the clock, in the reader's own locale, and the
 * date as well once it is no longer today.
 */
export function conversationTimestamp(
  iso: string,
  now: Date = new Date(),
): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  const sameDay =
    when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate()
  return sameDay
    ? when.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Everything about a transcript that is not the transcript: a stream that died,
 * a torn log, a patch with no item.
 *
 * They are gathered into one list rather than three scattered banners because
 * they answer one question — is what I am reading complete? A conversation with
 * nothing wrong returns an empty list and the window shows no row at all.
 */
export function transcriptWarnings(snapshot: ConversationSnapshot): string[] {
  const warnings: string[] = []
  if (snapshot.streamError !== null) warnings.push(snapshot.streamError)
  if (snapshot.unreadableTailLines > 0) {
    warnings.push(
      `${snapshot.unreadableTailLines} recorded event${plural(snapshot.unreadableTailLines)} at the end of this conversation could not be read back.`,
    )
  }
  if (snapshot.orphanPatches > 0) {
    warnings.push(
      `${snapshot.orphanPatches} update${plural(snapshot.orphanPatches)} arrived for a message this transcript never received.`,
    )
  }
  return warnings
}

/**
 * The one line the header says about the daemon.
 *
 * A connected daemon that does not have the configured provider is NOT
 * reported as connected-and-fine: the start it is about to refuse is the whole
 * point of the app, and the names it does offer are the half that fixes it.
 */
export function daemonHeadline(
  daemon: DaemonStatusView,
  providerId: string,
): string {
  if (!daemon.providerMissing) return daemon.headline
  const offered =
    daemon.advertisedProviders.length > 0
      ? daemon.advertisedProviders.join(', ')
      : 'none'
  return `Connected, but this daemon has no provider called “${providerId}”. It offers: ${offered}.`
}

/**
 * The snapshot the window may treat as the selection's — or null while it loads.
 *
 * The window holds one snapshot and one selection, and they are updated by
 * different beats: the selection changes the instant a row is clicked, the
 * snapshot only when the fetch for it comes back. In between, the held snapshot
 * belongs to the PREVIOUS conversation, and everything read off it was
 * therefore about the wrong one — a transcript still showing the old
 * conversation, and worse, a composer addressed to it.
 *
 * The mismatch is refused at the READ rather than repaired by clearing state on
 * every selection change, because there is no ordering of two `useState` calls
 * that makes a stale pairing impossible; there is only a derivation that cannot
 * express one.
 */
export function snapshotForSelection(
  selectedId: string | null,
  snapshot: ConversationSnapshot | null,
): ConversationSnapshot | null {
  if (selectedId === null || snapshot === null) return null
  return snapshot.id === selectedId ? snapshot : null
}

/**
 * Whether the composer may send right now, and what to say when it may not.
 *
 * The refusal is honest rather than hopeful: Studio does not queue input yet,
 * so a person typing into a working conversation is told to wait instead of
 * being shown a message that vanishes.
 */
export function composerState(snapshot: ConversationSnapshot | null): {
  canSend: boolean
  hint: string
  placeholder: string
} {
  if (!snapshot) {
    return {
      canSend: true,
      hint: '',
      placeholder: 'Describe what you want to make…',
    }
  }
  if (snapshot.status === 'running') {
    return {
      canSend: false,
      hint: 'The Entity is working. Studio does not queue messages yet — this one would have nowhere to wait.',
      placeholder: 'Waiting for the current answer…',
    }
  }
  return {
    canSend: true,
    hint: '',
    placeholder: 'Say what to change…',
  }
}

function plural(count: number): string {
  return count === 1 ? '' : 's'
}
