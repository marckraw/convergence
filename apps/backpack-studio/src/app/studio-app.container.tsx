import { useEffect, useRef, useState } from 'react'
import { HelloScreen } from '../features/daemon-handshake'
import { SignInContainer } from '../features/sign-in'
import { FirstRequest } from '../features/first-request'
import { Home } from '../features/home'
import { ConversationView } from '../widgets/conversation'
import { composerState, daemonHeadline } from '../entities/conversation'
import {
  readConnection,
  pendingConnection,
  connectionFromDaemon,
  simulateUnreachable,
  getStartup,
  listConversations,
  getTranscript,
  startConversation,
  sendMessage,
  onConversationEvent,
  onDaemonStatus,
  type ConversationSnapshot,
  type ConversationSummary,
  type StudioStartup,
  type DaemonStatusView,
} from '../shared/api'
import type { StudioIdentity } from '../shared/ui'

export function StudioApp(): React.JSX.Element {
  const [identity, setIdentity] = useState<StudioIdentity | null>(null)
  const [home, setHome] = useState(false)
  const [developer, setDeveloper] = useState(false)
  const [simulated, setSimulated] = useState(false)
  const [liveConnection, setConnection] = useState(pendingConnection)
  const [startup, setStartup] = useState<StudioStartup | null>(null)
  const [daemon, setDaemon] = useState<DaemonStatusView | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<
    Record<string, ConversationSnapshot>
  >({})
  const revisions = useRef(new Map<string, number>())
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let daemonPushed = false
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === 'd' &&
        !event.repeat
      ) {
        event.preventDefault()
        setDeveloper((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const report = (): void => {
      if (active)
        setError(
          'Studio could not read its local record or connection. Try reopening the app.',
        )
    }
    let stopEvents = () => {}
    let stopDaemon = () => {}
    try {
      stopEvents = onConversationEvent(({ snapshot }) => {
        if (!active) return
        revisions.current.set(
          snapshot.id,
          (revisions.current.get(snapshot.id) ?? 0) + 1,
        )
        setSnapshots((current) => ({ ...current, [snapshot.id]: snapshot }))
        setConversations((current) => [
          ...current.filter((row) => row.id !== snapshot.id),
          snapshot,
        ])
      })
      stopDaemon = onDaemonStatus((status) => {
        if (!active) return
        daemonPushed = true
        setDaemon(status)
        setConnection(connectionFromDaemon(status))
      })
      void getStartup()
        .then((value) => {
          if (!active) return
          setStartup(value)
          if (!daemonPushed && value.kind === 'ready') setDaemon(value.daemon)
        })
        .catch(report)
      void listConversations()
        .then((rows) => {
          if (active)
            setConversations((current) => {
              const merged = new Map(rows.map((row) => [row.id, row]))
              for (const row of current) merged.set(row.id, row)
              return [...merged.values()]
            })
        })
        .catch(report)
      void readConnection()
        .then((value) => {
          if (active && !daemonPushed) setConnection(value)
        })
        .catch(report)
    } catch {
      report()
    }
    return () => {
      active = false
      stopEvents()
      stopDaemon()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    const revision = revisions.current.get(selectedId) ?? 0
    void getTranscript(selectedId)
      .then((snapshot) => {
        if (
          active &&
          snapshot?.id === selectedId &&
          revision === (revisions.current.get(selectedId) ?? 0)
        ) {
          setSnapshots((current) => ({ ...current, [snapshot.id]: snapshot }))
        }
      })
      .catch(() => {
        if (active) setError('Studio could not load this conversation.')
      })
    return () => {
      active = false
    }
  }, [selectedId])

  const snapshot = selectedId ? (snapshots[selectedId] ?? null) : null
  const connection = simulated
    ? simulateUnreachable(liveConnection)
    : liveConnection
  const newConversation = (): void => {
    setSelectedId(null)
    setHome(true)
    setDraft('')
    setError(null)
  }
  const select = (id: string): void => {
    setSelectedId(id)
    setDraft('')
    setError(null)
  }
  async function submit(text: string, target: string | null): Promise<void> {
    if (!text.trim() || inFlight.current) return
    inFlight.current = true
    setSending(true)
    setError(null)
    try {
      if (target) {
        const outcome = await sendMessage(target, text.trim())
        if (outcome.kind === 'sent') setDraft('')
        else
          setError(
            outcome.kind === 'busy'
              ? 'The assistant is still working. Please wait for its answer.'
              : outcome.reason,
          )
      } else {
        const outcome = await startConversation(text.trim())
        if (outcome.conversationId) {
          setSelectedId(outcome.conversationId)
          setHome(true)
        }
        if (outcome.kind === 'started') setDraft('')
        else setError(outcome.reason)
      }
    } catch {
      setError('Studio could not send this request. Your text is still here.')
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }
  const state = composerState(snapshot)
  const composer = {
    value: draft,
    onChange: setDraft,
    onSend: () => {
      void submit(draft, selectedId)
    },
    disabled:
      sending || !state.canSend || (selectedId !== null && snapshot === null),
    hint: state.hint,
    placeholder: state.placeholder,
  }
  const ordered = [...conversations].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )

  if (developer)
    return (
      <div className="studio-developer">
        <p>Live daemon diagnostics · Ctrl+Shift+D to return</p>
        <label>
          <input
            type="checkbox"
            checked={simulated}
            onChange={(event) => setSimulated(event.target.checked)}
          />{' '}
          Simulate an unreachable daemon
        </label>
        {startup?.kind === 'misconfigured' && (
          <p>Missing variables: {startup.missing.join(', ')}</p>
        )}
        {startup?.kind === 'ready' && daemon?.providerMissing && (
          <p>{daemonHeadline(daemon, startup.providerId)}</p>
        )}
        <HelloScreen reading={connection} />
      </div>
    )
  if (!identity) return <SignInContainer onSignedIn={setIdentity} />
  const nav = {
    identity,
    connection,
    conversations: ordered,
    selectedId,
    onNew: newConversation,
    onSelect: select,
  }
  return (
    <>
      {error && (
        <p className="studio-notice" role="alert">
          {error}
        </p>
      )}
      {startup?.kind === 'misconfigured' && (
        <p className="studio-notice" role="alert">
          The remote assistant is not configured yet. Open developer diagnostics
          for the missing variable names.
        </p>
      )}
      {startup?.kind === 'ready' && daemon?.providerMissing && (
        <p className="studio-notice" role="alert">
          {daemonHeadline(daemon, startup.providerId)}
        </p>
      )}
      {selectedId ? (
        <ConversationView nav={nav} snapshot={snapshot} composer={composer} />
      ) : home || ordered.length > 0 ? (
        <Home {...nav} composer={composer} />
      ) : (
        <FirstRequest
          identity={identity}
          connection={connection}
          onSkip={newConversation}
          onStart={(text) => {
            void submit(text, null)
          }}
          composer={composer}
        />
      )}
    </>
  )
}
