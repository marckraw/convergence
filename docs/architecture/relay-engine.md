# The Relay Engine (Flows)

How the switchboard is built and where to cut it when a new node type arrives.
Product doctrine — vocabulary, staged scope, rulings — lives in the Linear
document "Flows — constitution & staged map"; this file is the code-facing
half: the laws the implementation must not break, and the seams a new trigger,
action or transform actually lands on.

Code: `electron/backend/relay/` (engine, service, pure, types, ipc),
`src/entities/session-relay/` (renderer mirror), `src/features/mission-control/`
(sentence, row, editor, hop trail), `src/widgets/mission-control/` (canvas).

## Shape

A **relay** is one wire inside a crew: a trigger, a payload and an action.
Convergence is the only thing that moves work between sessions — agents never
call agents, so nothing in this layer is intelligent. It listens, it carries,
it records.

```
session settles
  → RelayEngine.handleSettle(event)        engine: the only orchestration
      takes the flow-run baton             (in-memory ancestry, see loop law)
      → RelayService.listForSourceSession  service: repository + use cases
      → fire(relay) per wire
          guards: armed / status / loop law / budget
          payload: gateway read → compileRelayPayload → preview
          act: RelaySessionGateway.sendMessage | sendMessageWithOpener
               | create + start
          record: RelayService.appendHop → onHopAppended broadcast
```

The engine touches sessions only through `RelaySessionGateway` and crews only
through `RelayCrewGateway` — two hand-written interfaces listing the handful of
methods it may call. That narrowness is the quota law below, not tidiness.

## The four laws

### 1. No silent hops

Every firing writes exactly one ledger row before the engine returns:
deliveries, spawns, skips and errors alike. A wire the user cannot watch fire
is a silent hop. The one exception is ruled and deliberate: a **disarmed** wire
writes nothing, because a switch at rest never fired (constitution amendment 1,
2026-08-16).

### 2. The loop law — a wire fires once per flow run

Loops are wanted; A → B → A is our own review loop. But a chain that has been
all the way round has finished. Before acting, `fire()` asks
`RelayService.hasFiredInFlowRun(relayId, flowRunId)`; if the ledger already
holds a budgeted hop for that pair it writes one quiet `skipped-already-fired`
row and stops. Nothing is disarmed — the law is a pause, not a failure, and
the next run must find every wire live.

**Ancestry is a one-shot baton**, held in memory on the engine
(`Map<sessionId, flowRunId>`):

- a hop with a budgeted outcome leaves a baton on the session it landed in;
- a settle **takes and deletes** its baton, or mints a fresh run when there is
  none;
- a turn the user typed leaves no baton, so it always starts a fresh run and
  the wires live again.

This replaced an earlier ledger inference ("the run of the newest hop that ever
delivered into this session"), which under the loop law would have made a
manual hail tomorrow inherit today's finished run — every wire "already fired",
dead forever, from a switch the user can see is armed. A restart drops the
batons, so an interrupted chain resumes in a fresh run and one wire may fire
once more: the design errs toward liveliness, never toward a loop, because
once-per-run still governs the new run.

**Not every settle is a settle.** A wire with an opener (below) makes the
target come to rest twice per hop: once when the opener's own turn ends —
nothing finished, the work is still queued behind it — and once when the work
is actually done. The engine claims that first beat (`plumbingSettles`, a
counter per session) _before_ the baton is taken: it fires no wires, writes no
ledger row, and leaves the baton where it is. Skipping this is not cosmetic.
Consuming the baton on the plumbing beat would make the real settle mint a
**fresh** run, every wire would be live again, and A → B → A → B would
ping-pong forever with each lap legal in its own new run — the loop law
silently stops ending chains. Two tests in `relay.engine.test.ts` pin it.

The 20-hop **budget** (`MAX_AUTOMATIC_HOPS_PER_FLOW_RUN`) stays as a backstop
for the case the loop law cannot see: a chain of _distinct_ wires long enough
to outrun it. It disarms loudly and says why.

### 3. The vocabulary law — write a union, read a string

`RelayHopOutcome` is the vocabulary this build may **write**. Everything that
**reads** a stored outcome takes a plain `string`, because a ledger row may
carry a word an older or newer Convergence used — v0.45.22 shipped a
`skipped-disarmed` this build no longer knows. Reads degrade to a neutral
label and a quiet tone; they never render blank and never turn a crew red.
Adding an outcome therefore means: the union, `relayHopTone`,
`formatRelayHopOutcome`, and — only if it is genuinely alarming —
`ALARMING_RELAY_OUTCOMES`.

The same split applies to `isBudgetedOutcome`, which is the single place that
knows which words mean "a provider turn was spent". Three separate rules read
it: the budget count, the loop law, and baton hand-off. Keep it that way; a
`WHERE outcome IN (…)` in SQL would be a second copy free to drift.

### 4. The quota law — no test may reach a provider

The engine is the only thing in Convergence that spends provider quota with no
human pressing anything. Every test drives a fake `RelaySessionGateway`;
`spawn`, `execFile` and `child_process` must be unreachable from relay tests.
This is why the gateways are narrow interfaces rather than the real
`SessionService`: a test cannot accidentally start a process it has no way to
name.

## Extension seams

The three scenarios below were walked against the code as it stands. Each list
is what actually has to change — not what a framework would like to believe.

### Adding a trigger (e.g. `message-received`)

| Where                                         | What                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `relay.types.ts`                              | `RelayTrigger` union; `trigger` on `CreateSessionRelayInput`                  |
| `relay.pure.ts`                               | `normalizeRelayTrigger`                                                       |
| `relay.service.ts`                            | `create` currently hard-codes `'settled'` in the INSERT                       |
| `relay.service.ts`                            | `listForSourceSession` returns every wire; the caller must select by trigger  |
| `relay.engine.ts`                             | a second entry point beside `handleSettle`                                    |
| `electron/main/index.ts`                      | subscribe the new lifecycle seam                                              |
| `session.service.ts`                          | a **new multi-listener seam** if none exists — see the single-slot trap below |
| `session-relay.types.ts`, `electron-api.d.ts` | the renderer mirrors                                                          |
| `relay-sentence.pure.ts`                      | one entry in `RELAY_TRIGGER_CLAUSES`                                          |
| `relay-editor.presentational.tsx`             | a trigger picker; its labels are still authored by hand                       |
| `crew-flow-section.container.tsx`             | `RelayDraft` gains a trigger                                                  |

No migration: `session_relays.trigger` already exists with a `'settled'`
default.

The display words are the part that used to be able to drift. `RelaySentence`
now carries a `trigger` clause taken from `RELAY_TRIGGER_CLAUSES`, a `Record`
keyed by the union, and the row renders that instead of typing "When" and
"finishes" itself — so a trigger added to the type cannot ship without words,
and no row can claim a wire "finishes" when it fires on a message. The editor
is the one place still authoring its own labels; it has no trigger to look up
until the draft gains one.

### Adding an action (e.g. `run-script`)

| Where                                                  | What                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `relay.types.ts`                                       | `RelayAction`; a spec interface; the field on `SessionRelay`; both inputs; `sessionRelayFromRow` |
| `database.ts` + `database.types.ts`                    | a column for the spec, added idempotently (see `ensureRelayColumns`)                             |
| `relay.pure.ts`                                        | `normalizeRelayAction`; a spec normalizer; `assertRelayEndpoints`                                |
| `relay.service.ts`                                     | `create`/`update`: which spec belongs to which action, and which fields the other action drops   |
| `relay.engine.ts`                                      | the dispatch in `fire()`; a new narrow gateway for whatever the action does                      |
| `electron/main/index.ts`                               | inject that gateway                                                                              |
| `session-relay.types.ts`, `electron-api.d.ts`          | the renderer mirrors                                                                             |
| `relay-sentence.pure.ts`                               | a sentence branch; `RelayDraft`; `relayDraftProblem`'s branch                                    |
| `relay-editor.presentational.tsx`                      | the `ACTIONS` list and a branch of form fields                                                   |
| `crew-flow-section.container.tsx`                      | `save()`'s shape, `openEdit`'s hydration                                                         |
| `canvas-graph.pure.ts`, `session-canvas.container.tsx` | how the canvas draws it                                                                          |

This is the expensive one, and it is expensive **honestly**. The arms differ in
shape, not just in behaviour: a hail names an existing session and sends once;
a spawn describes a session that does not exist, creates it, joins it to a
crew, then starts it, and records the two phases separately because a session
that was created but failed to start still exists and the ledger must name it.
A per-action descriptor forced onto one signature would have to model "may
create a session", "may join a crew", "has a target", "has a spec" — a
framework describing two cases, which is the overbuild this pass exists to
refuse. Ruled 2026-08-20: **a two-arm switch is the simplest honest shape
here.** Revisit at the third action, when the shared shape is evidence rather
than a guess.

### Adding a payload transform

`fire()` reads the source's last assistant message and compiles the payload in
one place:

```ts
const payload = compileRelayPayload(relay.instruction, message)
const payloadPreview = buildRelayHopPreview(relay.opener, payload)
```

A transform is a pure `string → string` composed here. Two rules:

- **The ledger records the compiled payload**, never the source's own words.
  A preview that hid a transformation would be a silent hop by another name.
- **Formats are not reviewed until rendered** (the MAR-2280 law). The blank
  line in `compileRelayPayload` is load-bearing: markdown glues a plain line
  onto the paragraph above it and absorbs anything under an open blockquote,
  so a brief and a message without a separator arrive as one blurred block.
  String assertions cannot see this. Any new transform that composes text owes
  a test in `src/features/mission-control/relay-payload.render.test.tsx`,
  which puts the output through the transcript's own markdown component and
  asks the DOM where the words landed.

If the transform is configurable per wire it also costs the four touch points
`instruction` paid: column + migration, normalizer, types on both sides of the
IPC boundary, and the form.

### The opener: a wire that sends twice (F9)

`session_relays.opener` holds a first message — `/clear` is the case it was
built for — sent **on its own, verbatim**, with the compiled payload queued
behind it. One firing is still one hop row, one budget charge and one loop-law
slot; the outcome is always `queued`, because the payload waits behind the
opener by construction. The opener is never compiled: `compileRelayPayload`
touches the payload only, and a brief glued onto a `/clear` would stop it being
a command.

Three things make it work, and each is a place to be careful:

- **Both beats are one call.** `SessionService.sendMessageWithOpener` sends the
  opener and enqueues the payload synchronously. A caller that sent the opener
  and _then_ asked for a follow-up would lose a race: a turn does not report
  itself `running` until the provider process has actually started (there are
  awaits before `setStatus('running')` in the Claude adapter), so the session
  still reads idle and a second turn starts alongside the first.
- **The injection bypass is a one-caller seam.**
  `SendMessageInput.skipContextInjection` — and its stored twin
  `session_queued_inputs.skip_context_injection`, for an opener that waits in
  the queue — exists so the opener reaches the provider byte for byte.
  Every-turn project context prepends a block, and a message that no longer
  STARTS with `/` is prose, not a command. **Do not widen this to other
  callers**: a turn that quietly loses its project context is a bug everywhere
  except here, where the context is about to be thrown away anyway. The
  payload behind the opener keeps its injection, deliberately — it is the turn
  that most needs the project restated.
- **The queue is ours, not the provider's.** `dispatchNextQueuedInput` runs on
  settle and re-reads the continuation token at dispatch, so the payload lands
  in whatever context the opener left behind. This works on any provider,
  including ones with no native mid-run input.

The opener is plain text by design: its meaning belongs to whoever receives it.
`/clear` is Claude's word; on another provider the same box is just a message.
Hail wires only — a spawn opens a session that has never been used, so the
service drops an opener there the same way it drops a target.

**The transcript boundary** is the other half of the feature and lives in the
adapters: Convergence never clears its own transcript, so when a provider
replaces the conversation id mid-session the transcript would go on implying a
continuity the model no longer has. `ClaudeCodeProvider.setContinuationToken`
— the one place that id changes — writes a note tagged
`SESSION_RESTARTED_EVENT_TYPE` (`electron/backend/provider/session-restart.pure.ts`),
which the transcript renders as a divider rather than another grey line. A
_first_ id is silent: a session beginning is not a restart. Any adapter that
notices its conversation being replaced should emit the same tag; the renderer
matches that one literal across the tree boundary, and a test on each side
pins it.

## Sharp edges

- **The single-slot trap.** Session listener seams (`onSummaryUpdate`,
  `onConversationPatch`, `attentionObserver`, `onSessionTerminated`) are
  one-slot fields whose setters silently evict the previous listener; the
  renderer broadcast and the notifications service already hold theirs. The
  engine rides a purpose-built multi-listener seam (`onSessionSettled`). A new
  trigger needs its own; grabbing an existing slot breaks live UI or
  notifications with no error.
- **No foreign keys, ever.** Neither `session_relays` nor `relay_hops`
  declares one. A wire whose session was deleted must survive as a visibly
  broken row the user can see and remove, and hops must stay auditable after
  everything they describe is gone.
- **Deleting a relay means "stop doing this"**, never "pretend it never
  happened" — its hops stay.
- **Zustand selectors must return stable references.** Subscribe to the whole
  relay list and narrow with `useMemo`; selecting inside the subscription hands
  zustand a fresh array every render and spins.
