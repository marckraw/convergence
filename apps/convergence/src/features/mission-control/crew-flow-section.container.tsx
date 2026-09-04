import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { Plus, Radio, Waypoints } from 'lucide-react'
import { selectHailsForCrew, useCrewHailStore } from '@/entities/crew-hail'
import { sessionCrewApi, useSessionCrewStore } from '@/entities/session-crew'
import type { SessionCrew } from '@/entities/session-crew'
import {
  selectRelaysForCrew,
  useSessionRelayStore,
} from '@/entities/session-relay'
import type { RelayAction, SessionRelay } from '@/entities/session-relay'
import { useProjectStore } from '@/entities/project'
import {
  describeProviderAccountIdentity,
  providerAccountApi,
  providerAccountsForProvider,
  resolveInitialProviderAccountSelection,
} from '@/entities/provider-account'
import type { ProviderAccount } from '@/entities/provider-account'
import { selectLocalProviders, useSessionStore } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import {
  GLOBAL_PROJECT_OPTION_ID,
  RelayEditor,
} from './relay-editor.presentational'
import { CrewHailBanner } from './crew-hail-banner.presentational'
import { CrewLoopPanel } from './crew-loop-panel.presentational'
import {
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
  batonConditionToken,
  batonNameRefusal,
} from './crew-loop.pure'
import { RelayHopTrail } from './relay-hop-trail.container'
import { RelayRow } from './relay-row.presentational'
import {
  EMPTY_RELAY_DRAFT,
  buildRelayEndpointOptions,
  buildRelaySentence,
  formatRelayCount,
  relayDraftProblem,
} from './relay-sentence.pure'
import type { RelayDraft, RelaySpawnDraft } from './relay-sentence.pure'

interface CrewFlowSectionProps {
  crew: SessionCrew
}

type EditorState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; relayId: string }

/**
 * A crew's Flow: the wires drawn between its own sessions.
 *
 * Crews still promise membership only. This section is the switchboard panel
 * bolted to the side of one -- relays are listed as sentences, each with its
 * own switch, so the crew never silently becomes a machine.
 */
export const CrewFlowSection: FC<CrewFlowSectionProps> = ({ crew }) => {
  // Subscribed to the whole wire list, then narrowed here: selecting inside
  // the subscription would hand zustand a fresh array every render and spin.
  const allRelays = useSessionRelayStore((state) => state.relays)
  const createRelay = useSessionRelayStore((state) => state.createRelay)
  const updateRelay = useSessionRelayStore((state) => state.updateRelay)
  const deleteRelay = useSessionRelayStore((state) => state.deleteRelay)
  const setArmed = useSessionRelayStore((state) => state.setArmed)
  const error = useSessionRelayStore((state) => state.error)
  const clearError = useSessionRelayStore((state) => state.clearError)
  const sessions = useSessionStore((state) => state.globalSessions)
  const providers = useSessionStore(selectLocalProviders)
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])

  // Enrolled accounts are read once for the section rather than per wire: the
  // list is small, changes rarely, and every spawn form in this crew asks the
  // same question of it.
  useEffect(() => {
    let cancelled = false
    // Wrapped rather than chained off the call: a preload without the accounts
    // bridge throws synchronously, which no `.catch` would ever see, and the
    // whole Flow section would go down with it. A room that cannot read
    // accounts still has to draw its wires -- the engine falls back to ambient
    // exactly as it did before accounts existed.
    void (async () => {
      try {
        const loaded = await providerAccountApi.list()
        if (!cancelled) setAccounts(loaded)
      } catch {
        // Leave the list empty; the picker simply does not appear.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const projects = useProjectStore((state) => state.projects)

  const [editor, setEditor] = useState<EditorState>({ kind: 'closed' })
  const [draft, setDraft] = useState<RelayDraft>(EMPTY_RELAY_DRAFT)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [loopPanelOpen, setLoopPanelOpen] = useState(false)
  const [batonNameProblem, setBatonNameProblem] = useState<{
    sessionId: string
    message: string
  } | null>(null)
  // What is being TYPED, per member, until the person says it is finished.
  // Keyed by session id rather than held as one edit, because a crew's panel
  // has a field per member and nothing stops somebody starting a second one.
  const [batonNameDrafts, setBatonNameDrafts] = useState<
    Record<string, string>
  >({})

  const allHails = useCrewHailStore((state) => state.hails)
  const acknowledgeHail = useCrewHailStore((state) => state.acknowledge)
  const loadCrews = useSessionCrewStore((state) => state.load)
  const hails = useMemo(
    () => selectHailsForCrew({ hails: allHails }, crew.id),
    [allHails, crew.id],
  )

  const relays = useMemo(
    () => selectRelaysForCrew({ relays: allRelays }, crew.id),
    [allRelays, crew.id],
  )

  // Names come from the whole session list rather than the filtered room: a
  // wire keeps pointing at a session the room is currently hiding.
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )

  const resolveName = useCallback(
    (sessionId: string) => sessionsById.get(sessionId)?.name ?? null,
    [sessionsById],
  )

  const options = useMemo(
    () => buildRelayEndpointOptions(crew.sessionIds, resolveName),
    [crew.sessionIds, resolveName],
  )

  const projectOptions = useMemo(
    () => [
      { id: GLOBAL_PROJECT_OPTION_ID, label: 'no project (global)' },
      ...projects.map((project) => ({ id: project.id, label: project.name })),
    ],
    [projects],
  )

  const resolveProjectName = useCallback(
    (projectId: string | null) =>
      projectId
        ? (projects.find((project) => project.id === projectId)?.name ??
          'a project that is gone')
        : 'no project',
    [projects],
  )

  // Only conversational providers can be started with a prompt; a shell
  // session has nothing to hand a payload to.
  const providerOptions = useMemo(
    () =>
      providers
        .filter((provider) => provider.kind === 'conversation')
        .map((provider) => ({
          id: provider.id,
          label: provider.name,
          description: provider.vendorLabel,
        })),
    [providers],
  )

  const selectedProvider = providers.find(
    (provider) => provider.id === draft.spawn.providerId,
  )

  const modelOptions = useMemo(
    () =>
      (selectedProvider?.modelOptions ?? []).map((model) => ({
        id: model.id,
        label: model.label,
      })),
    [selectedProvider],
  )

  // Identity, not the label the user typed: two accounts can be nicknamed the
  // same thing, and a wire's sentence has to say which subscription it spends.
  const resolveAccountLabel = useCallback(
    (accountId: string) => {
      const account = accounts.find((entry) => entry.id === accountId)
      return account ? describeProviderAccountIdentity(account) : null
    },
    [accounts],
  )

  const spawnAccounts = useMemo(
    () => providerAccountsForProvider(accounts, draft.spawn.providerId),
    [accounts, draft.spawn.providerId],
  )

  const effortOptions = useMemo(
    () =>
      (
        selectedProvider?.modelOptions.find(
          (model) => model.id === draft.spawn.model,
        )?.effortOptions ?? []
      ).map((effort) => ({ id: effort.id, label: effort.label })),
    [selectedProvider, draft.spawn.model],
  )

  /**
   * The condition this wire would be pre-filled with: `BATON: <the target's
   * baton name>`.
   *
   * Derived from the crew's own roster rather than typed by hand, because the
   * convention only works if the name the wire waits for and the name the
   * station is told to declare are one string. Null when the far end has no
   * baton name yet — offering `BATON: ` with nothing after it would be a
   * condition that can never match.
   */
  const suggestedConditionToken = useMemo(() => {
    if (draft.action === 'spawn') return null
    const target = crew.members.find(
      (member) => member.sessionId === draft.targetSessionId,
    )
    return target?.batonName ? batonConditionToken(target.batonName) : null
  }, [crew.members, draft.action, draft.targetSessionId])

  const problem = relayDraftProblem(
    draft,
    relays,
    editor.kind === 'edit' ? editor.relayId : null,
  )

  const closeEditor = useCallback(() => {
    setEditor({ kind: 'closed' })
    setDraft(EMPTY_RELAY_DRAFT)
    clearError()
  }, [clearError])

  const openCreate = useCallback(() => {
    clearError()
    setConfirmingDeleteId(null)
    // A crew with one member cannot hail anybody, so the form opens on the
    // action that actually works rather than on a dead end.
    setDraft({
      ...EMPTY_RELAY_DRAFT,
      action: options.length >= 2 ? 'hail' : 'spawn',
    })
    setEditor({ kind: 'create' })
  }, [clearError, options.length])

  const openEdit = useCallback(
    (relay: SessionRelay) => {
      clearError()
      setConfirmingDeleteId(null)
      setDraft({
        action: relay.action,
        sourceSessionId: relay.sourceSessionId,
        targetSessionId: relay.targetSessionId,
        instruction: relay.instruction ?? '',
        opener: relay.opener ?? '',
        conditionToken: relay.conditionToken ?? '',
        spawn: relay.spawnSpec
          ? {
              projectId: relay.spawnSpec.projectId,
              providerId: relay.spawnSpec.providerId,
              model: relay.spawnSpec.model,
              effort: relay.spawnSpec.effort,
              name: relay.spawnSpec.name,
              providerAccountId: relay.spawnSpec.providerAccountId,
            }
          : EMPTY_RELAY_DRAFT.spawn,
      })
      setEditor({ kind: 'edit', relayId: relay.id })
    },
    [clearError],
  )

  const save = useCallback(async () => {
    if (problem || editor.kind === 'closed') return
    if (!draft.sourceSessionId) return

    const spawning = draft.action === 'spawn'
    if (spawning ? !draft.spawn.providerId : !draft.targetSessionId) return

    // The two actions are mutually exclusive on the wire, so each save clears
    // whatever the other one would have left behind.
    const shape = spawning
      ? {
          action: 'spawn' as const,
          targetSessionId: null,
          spawnSpec: {
            projectId: draft.spawn.projectId,
            providerId: draft.spawn.providerId as string,
            model: draft.spawn.model,
            effort: draft.spawn.effort,
            name: draft.spawn.name.trim() || 'Relayed session',
            providerAccountId: draft.spawn.providerAccountId,
          },
        }
      : {
          action: 'hail' as const,
          targetSessionId: draft.targetSessionId,
          spawnSpec: null,
        }

    // Sent as an explicit null rather than omitted, so clearing the box on an
    // edit actually removes the brief instead of quietly keeping the old one.
    const instruction = draft.instruction.trim() ? draft.instruction : null
    // Same explicit null, and never on a spawn: a session that opened a moment
    // ago has nothing to clear, so the field is not offered there and must not
    // survive a wire that switched actions.
    const opener = !spawning && draft.opener.trim() ? draft.opener : null
    // Same explicit null, and kept across an action switch: a condition is
    // about WHEN the wire fires, which both actions ask the same way.
    const conditionToken = draft.conditionToken.trim()
      ? draft.conditionToken
      : null

    setBusy(true)
    const saved =
      editor.kind === 'create'
        ? await createRelay({
            crewId: crew.id,
            sourceSessionId: draft.sourceSessionId,
            instruction,
            opener,
            conditionToken,
            ...shape,
          })
        : await updateRelay(editor.relayId, {
            sourceSessionId: draft.sourceSessionId,
            instruction,
            opener,
            conditionToken,
            ...shape,
          })
    setBusy(false)

    // A rejected wire keeps the form open with the store's reason under it,
    // so nothing the user typed is thrown away by a failure.
    if (saved) closeEditor()
  }, [problem, editor, draft, createRelay, updateRelay, crew.id, closeEditor])

  const toggleArmed = useCallback(
    async (relay: SessionRelay, armed: boolean) => {
      setBusy(true)
      await setArmed(relay.id, armed)
      setBusy(false)
    },
    [setArmed],
  )

  /**
   * Names a member's baton, or renames it.
   *
   * Goes through the API and reloads the roster rather than mutating in place:
   * the backend lowercases and collapses what was typed, and the field the
   * user is about to pre-fill a condition from must show the stored spelling,
   * not the one they happened to press.
   *
   * A refusal keeps the roster exactly as it was AND puts the door's own
   * sentence under the field. A swallowed refusal shows as nothing but the
   * typing vanishing -- which is the silent-drop class with a text box in
   * front of it.
   */
  const setBatonName = useCallback(
    async (sessionId: string, batonName: string) => {
      setBusy(true)
      // The next attempt is the user answering the refusal, so the sentence
      // belongs to the attempt it came from rather than to the field.
      setBatonNameProblem(null)
      try {
        await sessionCrewApi.setMemberBatonName(
          crew.id,
          sessionId,
          batonName.trim() ? batonName : null,
        )
        await loadCrews()
      } catch (err) {
        // The roster stays as it was; the broadcast is the authority and it
        // never fired. The field reverts to the stored name on its own -- it
        // is rendered from the roster -- and now it reverts with a reason.
        setBatonNameProblem({ sessionId, message: batonNameRefusal(err) })
      }
      setBusy(false)
    },
    [crew.id, loadCrews],
  )

  /**
   * The name is finished: the person left the field or pressed Enter.
   *
   * The door refuses a name whose last character is a formatting mark, so a
   * field that went to the door on every keystroke made `my_horse`
   * untypeable -- `my_` was refused mid-word and the field snapped back before
   * the `h`. Typing is not a name; this is where a name is.
   *
   * The draft is dropped before the trip, which does two things: the field
   * goes back to reading the roster (so a refused name never sits there
   * looking stored), and a second finish -- Enter, then the blur it causes --
   * finds nothing to send rather than knocking twice.
   */
  const commitBatonName = useCallback(
    async (sessionId: string) => {
      const typed = batonNameDrafts[sessionId]
      if (typed === undefined) return
      setBatonNameDrafts((drafts) => {
        const next = { ...drafts }
        delete next[sessionId]
        return next
      })
      await setBatonName(sessionId, typed)
    },
    [batonNameDrafts, setBatonName],
  )

  const setLoopLimit = useCallback(
    async (patch: {
      roundCap?: number | null
      stallMinutes?: number | null
    }) => {
      setBusy(true)
      try {
        await sessionCrewApi.update(crew.id, patch)
        await loadCrews()
      } catch {
        // Same as above: an unchanged crew is the honest fallback.
      }
      setBusy(false)
    },
    [crew.id, loadCrews],
  )

  const confirmDelete = useCallback(
    async (relay: SessionRelay) => {
      setBusy(true)
      await deleteRelay(relay.id)
      setBusy(false)
      setConfirmingDeleteId(null)
      if (editor.kind === 'edit' && editor.relayId === relay.id) closeEditor()
    },
    [deleteRelay, editor, closeEditor],
  )

  // A spawn only needs the session that finishes, so one member is enough to
  // draw a wire -- only an empty crew has nothing to listen to.
  const noMembers = options.length === 0
  const canHail = options.length >= 2

  return (
    <section
      data-crew-flow
      aria-label={`Flow for ${crew.name}`}
      className="flex flex-col gap-1.5 border-b border-white/10 px-4 py-2"
    >
      <div className="flex items-center gap-2">
        <Radio aria-hidden className="size-3 text-muted-foreground" />
        <h3 className="text-[11px] font-medium">Flow</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatRelayCount(relays.length)}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={loopPanelOpen}
          onClick={() => setLoopPanelOpen((open) => !open)}
          className="ml-auto h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Waypoints className="size-3" />
          Loop
        </Button>

        {editor.kind === 'closed' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={noMembers}
            title={
              noMembers
                ? 'A relay listens to a session in this crew — add one first.'
                : undefined
            }
            onClick={openCreate}
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" />
            Add relay
          </Button>
        ) : null}
      </div>

      <CrewHailBanner
        hails={hails}
        resolveName={resolveName}
        onAcknowledge={(id) => {
          void acknowledgeHail(id)
        }}
      />

      {loopPanelOpen ? (
        <CrewLoopPanel
          members={crew.members}
          resolveName={resolveName}
          roundCap={crew.roundCap}
          stallMinutes={crew.stallMinutes}
          defaultRoundCap={DEFAULT_CREW_ROUND_CAP}
          defaultStallMinutes={DEFAULT_CREW_STALL_MINUTES}
          busy={busy}
          batonNameProblem={batonNameProblem}
          batonNameDrafts={batonNameDrafts}
          onBatonNameEdit={(sessionId, batonName) => {
            setBatonNameDrafts((drafts) => ({
              ...drafts,
              [sessionId]: batonName,
            }))
          }}
          onBatonNameCommit={(sessionId) => {
            void commitBatonName(sessionId)
          }}
          onRoundCapChange={(roundCap) => {
            void setLoopLimit({ roundCap })
          }}
          onStallMinutesChange={(stallMinutes) => {
            void setLoopLimit({ stallMinutes })
          }}
        />
      ) : null}

      {relays.length === 0 && editor.kind === 'closed' ? (
        <p className="text-[11px] text-muted-foreground">
          {noMembers
            ? 'Add a session to this crew before wiring anything.'
            : canHail
              ? 'No relays yet. Wire one session to another, or have one start a new session, and Convergence carries the handoff.'
              : 'No relays yet. With one session here, a relay can have it start a new session when it finishes.'}
        </p>
      ) : null}

      {relays.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {relays.map((relay) => (
            <RelayRow
              key={relay.id}
              relay={relay}
              sentence={buildRelaySentence(
                relay,
                resolveName,
                resolveProjectName,
                resolveAccountLabel,
              )}
              confirmingDelete={confirmingDeleteId === relay.id}
              busy={busy}
              onToggleArmed={toggleArmed}
              onEdit={openEdit}
              onRequestDelete={(target) => setConfirmingDeleteId(target.id)}
              onConfirmDelete={confirmDelete}
            />
          ))}
        </ul>
      ) : null}

      {editor.kind === 'closed' ? null : (
        <RelayEditor
          options={options}
          action={draft.action}
          sourceSessionId={draft.sourceSessionId}
          targetSessionId={draft.targetSessionId}
          instruction={draft.instruction}
          opener={draft.opener}
          conditionToken={draft.conditionToken}
          suggestedConditionToken={suggestedConditionToken}
          spawn={draft.spawn}
          projectOptions={projectOptions}
          providerOptions={providerOptions}
          modelOptions={modelOptions}
          effortOptions={effortOptions}
          spawnAccounts={spawnAccounts}
          problem={problem}
          busy={busy}
          editing={editor.kind === 'edit'}
          onActionChange={(action: RelayAction) =>
            setDraft((current) => ({ ...current, action }))
          }
          onSourceChange={(sessionId) =>
            setDraft((current) => ({ ...current, sourceSessionId: sessionId }))
          }
          onTargetChange={(sessionId) =>
            setDraft((current) => ({ ...current, targetSessionId: sessionId }))
          }
          onInstructionChange={(instruction) =>
            setDraft((current) => ({ ...current, instruction }))
          }
          onOpenerChange={(opener) =>
            setDraft((current) => ({ ...current, opener }))
          }
          onConditionTokenChange={(conditionToken) =>
            setDraft((current) => ({ ...current, conditionToken }))
          }
          onSpawnChange={(patch: Partial<RelaySpawnDraft>) =>
            setDraft((current) => ({
              ...current,
              spawn: {
                ...current.spawn,
                ...patch,
                // Changing provider re-asks the account question: ids belong to
                // one provider, so carrying the old choice over would name an
                // account that cannot serve the session. Preselects the same
                // enrolled default the composer would have shown.
                ...(patch.providerId !== undefined &&
                patch.providerId !== current.spawn.providerId
                  ? {
                      providerAccountId: resolveInitialProviderAccountSelection(
                        {
                          accounts: providerAccountsForProvider(
                            accounts,
                            patch.providerId,
                          ),
                          hasActiveSession: false,
                        },
                      ),
                    }
                  : {}),
              },
            }))
          }
          onSave={() => {
            void save()
          }}
          onCancel={closeEditor}
        />
      )}

      <RelayHopTrail crewId={crew.id} resolveName={resolveName} />

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
    </section>
  )
}
