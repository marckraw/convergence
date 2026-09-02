import { useCallback, useEffect, useState } from 'react'
import {
  getStartup,
  getTranscript,
  listConversations,
  onConversationEvent,
  sendMessage,
  startConversation,
  type ConversationSnapshot,
  type ConversationSummary,
  type StudioStartup,
} from '../../shared/studio-api'
import { composerState, daemonHeadline } from '../../entities/conversation'
import { ConversationList } from '../../features/conversation-list'
import { Composer } from '../../features/composer'
import { StartupNotice } from '../../features/startup-notice'
import { Transcript } from '../../features/transcript'
import { studioTheme } from '../../shared/ui'

/**
 * Studio's whole window (MAR-2770).
 *
 * The one container: it owns the startup reading, the conversation list, the
 * selected conversation, the draft and every effect. Everything it renders is
 * render-only, which is the split this repo enforces and the reason each of
 * those files can be read without knowing what else is happening.
 *
 * It holds no truth of its own. The list and the snapshots come from the main
 * process — which folded them out of the event log — and the pushes replace
 * them wholesale. A renderer that patched its own copy would be a second fold,
 * free to disagree with the one on disk.
 */
export function StudioShell(): React.JSX.Element {
  const [startup, setStartup] = useState<StudioStartup | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ConversationSnapshot | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      const [reading, rows] = await Promise.all([
        getStartup(),
        listConversations(),
      ])
      if (!live) return
      setStartup(reading)
      setConversations(rows)
      // The most recent conversation is the one a person left off in, and the
      // list is newest first.
      if (rows.length > 0) setSelectedId((current) => current ?? rows[0].id)
    })()
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (selectedId === null) {
      setSnapshot(null)
      return
    }
    let live = true
    void (async () => {
      const next = await getTranscript(selectedId)
      if (!live) return
      // A push that landed while this fetch was in flight is NEWER than what
      // the fetch is carrying, so it wins. Without this the reply would
      // overwrite it and the transcript would sit one update behind until the
      // next push — and a conversation that has just gone idle has no next
      // push.
      setSnapshot((current) => (current?.id === selectedId ? current : next))
    })()
    return () => {
      live = false
    }
  }, [selectedId])

  useEffect(
    () =>
      onConversationEvent((event) => {
        // Every push carries a whole conversation, so the list row and the open
        // transcript are updated from the same value and cannot disagree.
        setConversations((current) => mergeSummary(current, event))
        // Compared against the selection rather than against the snapshot
        // already held: the first push of a brand new conversation arrives
        // before anything has been loaded for it, and gating on the held
        // snapshot dropped exactly that one.
        if (event.conversationId === selectedId) setSnapshot(event.snapshot)
      }),
    [selectedId],
  )

  const composer = composerState(snapshot)

  const send = useCallback(async () => {
    const text = draft.trim()
    if (text === '') return
    setSending(true)
    setRefusal(null)
    try {
      if (snapshot === null) {
        const outcome = await startConversation(text)
        setDraft('')
        setSelectedId(outcome.conversationId)
        setConversations(await listConversations())
        if (outcome.kind === 'refused') setRefusal(outcome.reason)
        return
      }
      const outcome = await sendMessage(snapshot.id, text)
      if (outcome.kind === 'sent') {
        setDraft('')
        return
      }
      setRefusal(
        outcome.kind === 'busy'
          ? 'That conversation is still working. Wait for it to finish.'
          : outcome.reason,
      )
    } finally {
      setSending(false)
    }
  }, [draft, snapshot])

  if (startup === null) {
    return <main style={shellStyle} />
  }

  if (startup.kind === 'misconfigured') {
    return (
      <StartupNotice
        sentence={
          startup.missing.length === 1
            ? 'Backpack Studio needs one more thing before it can reach the daemon:'
            : 'Backpack Studio needs these before it can reach the daemon:'
        }
        missing={startup.missing}
      />
    )
  }

  const daemonSentence = daemonHeadline(startup.daemon, startup.providerId)
  const daemonHealthy =
    startup.daemon.status === 'connected' && !startup.daemon.providerMissing

  return (
    <main style={shellStyle}>
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id)
          setRefusal(null)
        }}
        onNew={() => {
          setSelectedId(null)
          setRefusal(null)
          setDraft('')
        }}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {daemonHealthy ? null : (
          <p
            role="status"
            style={{
              margin: 0,
              padding: '10px 28px',
              background: `${studioTheme.danger}18`,
              borderBottom: `1px solid ${studioTheme.border}`,
              fontSize: '13px',
            }}
          >
            {daemonSentence}
            {startup.daemon.detail === null ? '' : ` ${startup.daemon.detail}`}
          </p>
        )}
        <Transcript snapshot={snapshot} />
        {refusal === null ? null : (
          <p
            role="status"
            style={{
              margin: 0,
              padding: '10px 28px',
              color: studioTheme.text,
              background: `${studioTheme.danger}18`,
              fontSize: '13px',
            }}
          >
            {refusal}
          </p>
        )}
        <Composer
          value={draft}
          placeholder={composer.placeholder}
          hint={composer.hint}
          canSend={composer.canSend}
          busy={sending}
          onChange={setDraft}
          onSend={() => void send()}
        />
      </div>
    </main>
  )
}

/**
 * One pushed conversation into the list, in place, newest first.
 *
 * A push about a conversation the list has not heard of is an insertion rather
 * than a no-op: the first snapshot of a brand new conversation arrives before
 * the list has been re-read.
 */
function mergeSummary(
  current: ConversationSummary[],
  event: { conversationId: string; snapshot: ConversationSnapshot },
): ConversationSummary[] {
  const summary: ConversationSummary = {
    id: event.snapshot.id,
    title: event.snapshot.title,
    createdAt: event.snapshot.createdAt,
    updatedAt: event.snapshot.updatedAt,
    status: event.snapshot.status,
  }
  const known = current.some((row) => row.id === event.conversationId)
  const next = known
    ? current.map((row) => (row.id === event.conversationId ? summary : row))
    : [...current, summary]
  return [...next].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )
}

const shellStyle = {
  height: '100vh',
  display: 'flex',
  background: studioTheme.canvas,
  color: studioTheme.text,
  fontFamily: studioTheme.font,
  fontSize: '14px',
} as const
