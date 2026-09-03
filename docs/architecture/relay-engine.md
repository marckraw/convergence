# The Relay Engine (Flows)

How the switchboard is built and where to cut it when a new node type arrives.
Product doctrine — vocabulary, staged scope, rulings — lives in the Linear
document "Flows — constitution & staged map"; this file is the code-facing
half: the laws the implementation must not break, and the seams a new trigger,
action or transform actually lands on.

Every code path in this document is relative to the `apps/convergence`
workspace (MAR-2706), not the repository root.

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
      marks the station came back          (RelayService.markStationSettled)
      takes the flow-run baton             (in-memory ancestry, see loop law)
      → RelayService.listForSourceSession  service: repository + use cases
      → fire(relay) per wire
          guards: armed / mute / status
                  → round meter (per crew)
                  → terminal baton / wire condition
                  → loop law / round cap / hop budget
          payload: gateway read → compileRelayPayload → preview
          act: RelaySessionGateway.sendMessage | sendMessageWithOpener
               | create + start
          record: RelayService.appendHop → onHopAppended broadcast
      → parkIfUnanswered   per crew: a baton nobody answered hails Marcin

timer (electron/main/relay-stall-clock.ts)
  → RelayEngine.checkForStalls()          the settle that never arrives
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

### 1a. The quiet send — the human may silence one settle (F10, MAR-2537)

A message may be sent asking for quiet: the wires leaving that session do not
fire when the work in flight finishes. It is a fact about the **settle**, not
about a turn — `sessions.relays_muted` means _someone asked for quiet since
this session last came to rest_, set at dispatch and cleared by the settle that
honours it, in the same `UPDATE` that commits the status so nothing between the
two writes can leave a session settled but still marked quiet.

If **any** message contributing to the finished work asked for quiet, the settle
is quiet. Mute wins ties, deliberately: erring quiet costs one manual hail,
while erring loud spends provider quota and wakes another agent mid-work, and
those are not symmetric. There is no way to silence one of two messages that
end together, and there should not be.

**Where the guard sits in `fire()`, and why.** Immediately after `armed`, ahead
of the status, loop-law and budget guards:

- _behind `armed`_, because a switch at rest is not a firing and a mute is not
  the switch's state — a disarmed wire keeps the silence law 1 grants it;
- _ahead of everything else_, because everything below it is a fact about the
  flow's state while the mute is the human's explicit instruction about this
  settle. So the ledger says what they actually did, and the row count for a
  quiet settle stays predictable: N armed wires, N `skipped-muted` rows, always.
  Under the status guard, a quiet settle that also failed would file as
  `skipped-failed`, which reads as though the flow tried; under the budget
  guard, it could disarm a wire on the way past.

`skipped-muted` is deliberately **not** a budgeted outcome and **not** an
alarming one: no budget is charged, no baton is handed on, the loop law's
already-fired check stays unsatisfied, and the row reads grey. The wire stays
armed, and the next ordinary message carries as usual.

Convergence never infers the mute. It does not sniff `/clear` or `/compact` and
silence itself — a wire that stops firing for reasons the user did not ask for
is worse than one that fires when they forgot.

**The one exception is not an inference (MAR-2759).**
`SessionService.sendMessageWithOpener` marks its opener quiet unconditionally,
and there is no flag to turn that off. It is not sniffing: nothing reads the
text. The relay KNOWS it sent that message, and it knows the message finished
nothing — the target was wiped and the real work is still queued behind it. A
wire leaving that target which treated the opener's settle as a finish would
answer itself into the next station. The engine recognises the opener's settle
by its dispatch id (below); this mark is in the database, so it survives the
restart that empties the engine's memory.

### 2. The loop law — a wire fires once per flow run

Loops are wanted; A → B → A is our own review loop. But a chain that has been
all the way round has finished. Before acting, `fire()` asks
`RelayService.hasFiredInFlowRun(relayId, flowRunId)`; if the ledger already
holds a budgeted hop for that pair it writes a `skipped-already-fired` row and
stops. Nothing is disarmed — the law is a pause, not a failure, and the next
run must find every wire live.

**A cyclic crew therefore closes exactly ONE lap per flow run** (ruled, RUN39
D1). Say it that way everywhere: the round cap below governs a chain of
_distinct_ wires inside one run, not repeated laps of the same ring, and an
unattended lap 2 is not a thing this build does. Making it one is an explicit
lap/generation model — wire eligibility resetting per lap while the per-crew
cap survives — which is its own ticket and a constitution amendment, not a
patch inside a guard.

**The closure is LOUD when a baton was riding.** If the finishing message
declared a route and the wire that answers to it already carried this run,
the station handed work to something that cannot take it: the loop has parked.
The row stays grey and the chair is called with reason `loop-closed`. A chain
ending with nobody told is the defect class this feature exists to remove,
and the loop law is not exempt from it.

**Every delivery has a receipt (MAR-2759, the delivery receipt).** The
session service is the only party that knows which turn carries which input,
so it says so: every input the relay hands over (`sendMessage`, both beats of
`sendMessageWithOpener`, `start`) returns a durable **dispatch id** minted by
the session layer. A native follow-up (a provider advertising
`supportsNativeFollowUp`, e.g. Pi) attaches its id to the RUNNING turn; an
app-queued input's id rides the queue row (`session_queued_inputs.dispatch_id`)
and attaches to the turn it later starts. When a turn comes to rest,
`SessionSettledEvent.dispatchIds` names every id that turn consumed — a list,
because one turn may consume several inputs — drained in the same statement
that commits the terminal status, so receipt and settle cannot disagree. Human
turns mint and name ids too; the engine simply holds none of theirs.

**Ancestry is a one-shot baton keyed by dispatch id**, held in memory on the
engine (`Map<dispatchId, flowRunId>`):

- a hop with a budgeted outcome leaves a baton keyed by the receipt it landed
  under — a second dispatch into the same session leaves a second baton
  _beside_ it, never over it;
- a settle **takes every held baton it names**; a settle naming several runs
  (two runs coalesced into one native turn) continues the **oldest** run —
  insertion order of the map, so it is deterministic — and consumes the other
  named batons with it: one finished message carries on under one run, the
  wires are measured against it, nothing is dropped;
- a held baton the settle does NOT name is preserved, not spent: the beat that
  ended was some other work (a turn already running, a turn the user typed),
  and the run is still waiting on its own settle;
- a settle naming no held baton mints a fresh run, so a turn the user typed
  always starts one and the wires live again.

Keyed by the dispatch and never by the session, because a session is a
_container_ that may hold several outstanding dispatches at once: two wires of
one run queued into the same target, or two runs whose payloads joined one
native turn. A one-slot-per-session map lost every receipt but the last, so
the first queued payload's settle named nothing held and minted a fresh run —
in which every already-fired wire was live again, the loop-law breach. **The
bound on this seam (RUN39 round 4) is dispatch-set fidelity: a session-keyed
slot, a whole-settle boolean, or a "first id wins" anywhere the engine reads a
settle's ids is a STOP and a design talk, not a patch.**

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
is actually done. The engine holds the opener's dispatch id
(`plumbingDispatchIds`, a set) and recognises that first beat _by identity_,
before the baton is taken: a settle is **plumbing-only iff it names at least
one id and every id it names is a held opener's**. That beat fires no wires,
writes no ledger row, and leaves the baton where it is. Skipping this is not
cosmetic. Consuming the baton on the plumbing beat would make the real settle
mint a **fresh** run, every wire would be live again, and A → B → A → B would
ping-pong forever with each lap legal in its own new run — the loop law
silently stops ending chains.

**An opener is always a turn of its own (ruled, RUN39 round 5: design X).**
`SessionService.sendMessageWithOpener` decides at dispatch: an idle target
takes the opener as its own turn; a target carrying a turn — `running` with a
live handle, a remote turn reattached after a restart, or a send still on its
way to the provider (the MAR-2550 window) — gets the opener **queued** durably
as a follow-up with its own receipt, ahead of the payload, on every provider,
native follow-up included. So nothing else can ever finish in the turn an
opener's settle ends, and "every named id is an opener's" is true by
construction rather than by luck. The earlier "mixed settle" construct — an
opener natively joining a running turn, its settle naming the opener beside
real work — is unreachable and was deleted with its canary: after a restart
had lost the running turn's own receipts, that settle named the opener alone,
and the engine, correct for a complete set, erased the real work as plumbing
without a row. Two canaries in `relay.engine.test.ts` pin the set (same-run
fan-in into one queued target; one settle naming batons of two runs), and the
production composition is pinned in `session.service.test.ts` ("an opener is
always its own turn"): real remote work on a Pi-shaped session, `running`
persisted, a fresh `SessionService`, reattach, an opener fired at the
still-running target, then the settles.

**A reattach-lost set can only err loud.** `SessionService.turnDispatchIds`
is in memory and `resumeRunningRemoteSessions` rebuilds the handle but not the
receipts, so a turn that outlives the app comes to rest naming none of ours.
That settle is somebody's work: it proceeds, mints a fresh run, and journals
through the station's armed wires (`delivered`, `skipped-muted`,
`skipped-failed` as the case is). A payload receipt lost the same way leaves
its hop unstamped and the stall clock asks a human. Neither direction can read
as a false "completed"; persisting the in-flight set across reattach (design
Y) remains a possible follow-up if the loud side proves noisy in practice.

The 20-hop **budget** (`MAX_AUTOMATIC_HOPS_PER_FLOW_RUN`) stays as a backstop
for the case the loop law cannot see: a chain of _distinct_ wires long enough
to outrun it. It disarms loudly and says why.

**The ledger is load-bearing, so emptying it is guarded.** Because both the
loop law and the budget count read `relay_hops`, deleting a live run's rows
would tell a wire it never fired and reopen the loop the law had closed. The
engine therefore publishes `liveFlowRunIds()` — the union of every baton it
holds and every run a settle is carrying _right now_ (`runsInFlight`, a
counter, because one hop can leave batons on two sessions) — and the
`relayHops:clear` handler passes it to `RelayService.clearHops` as
`keepFlowRunIds`. Those rows survive the wipe; the UI says how many and why.
`runsInFlight` is not redundant with the batons: a settle takes its baton at
the top and does not leave the next one until a hop is recorded, and a provider
send is awaited inside that gap, so an IPC call landing there would otherwise
see a live run as finished. Batons are memory, so a restart makes an
interrupted run clearable — the same direction the baton already errs. Five
tests in `relay.engine.test.ts` pin it, including a canary that asserts the
loop _does_ reopen when the live runs are not spared, and one that fails the
moment `runsInFlight` is collapsed from a counter to a set.

### 2a. The baton — a wire fires only on a declared route (MAR-2759)

A relay may carry a `conditionToken`: it fires only when the source session's
final assistant message's **last non-empty line** equals that token, compared
case-insensitively with internal whitespace collapsed. One string compare, in
one pure function (`relayConditionMatches`). By convention the token reads
`BATON: <name>`, and a crew member's baton name (`session_crew_members.baton_name`)
is what the editor pre-fills it with.

**The relay never parses prose.** Routing by intent-sniffing is a text proxy
for a question only the author can answer; the finishing station _declares_ its
route on a line of its own. Normalising case and whitespace is not parsing --
it is applied identically to both sides and cannot make two different
declarations equal.

Where the guard sits in `fire()`, and why: **above** the loop law and both
budgets, **below** the mute and the failure guard. Those two are facts about
the settle and outrank anything the message says; everything below is a
question about a wire that is already a candidate, and this is the question of
whether it is one at all. A wire waiting for a route the message never named
has not been _stopped_, so it must not read as one that was.

`null` is unconditional, which is what every wire drawn before this existed
was, and still is.

**`BATON: marcin` is reserved, and it outranks ROUTING, not just conditions.**
`normalizeRelayConditionToken` refuses it as a wire's condition: it is the one
route guaranteed to reach a human, and a wire that claimed it would turn the
chair into just another station. In `fire()` the check sits **above the
condition gate**, so an unconditional wire — which answers every message by
definition — cannot carry it either. A terminal that only beat conditioned
wires would deliver his work onward and leave the chair dark beside every
legacy wire in the app.

### 2b. The hail — a loop that parks is LOUD (MAR-2759)

Five ways a crew can need a human, all of them previously silence. They live in
`crew_hails`, **beside** the ledger rather than in it, for three reasons a hop
row cannot satisfy: a hail has a lifecycle nobody else has (raised, then
acknowledged); it is crew-level while every hop row is a wire firing; and an
unrouted baton from a station with **no outgoing wire at all** has no
`relay_id` to attribute a row to -- which is exactly the case it exists for.
Folding it in would also make "Clear trail" dismiss alarms.

- `terminal` / `unrouted`: raised by `parkIfUnanswered` after every wire has
  had its turn, when a baton was emitted and **no wire answered it**.
  "Answered" is about the CONDITION, not delivery: a wire whose baton matched
  and then declined for its own reason (an error, the round cap or the loop
  law, which hail on their own) did answer, and the trail records what happened
  next. Only on a completed, unmuted settle.
- `loop-closed`: raised inside `fire()` when the loop law ends a chain with a
  baton riding, above.
- `round-budget`: raised inside `fire()` at the cap, below.
- `stall`: raised by `checkForStalls`, below.

Which crews get hailed is `flowCrewIds`: the crews of the session's outgoing
wires, unioned with every crew it merely BELONGS to that owns at least one
wire. The second half is what makes the silent drop impossible -- a station
wired only as a target has no outgoing wire to write a row through. A crew with
no wires anywhere is a label, not a flow.

**"Answered" is a fact per crew, never per settle.** One session can be a beat
in two loops at once, so the engine collects the crew ids whose wires answered
and parks the rest independently. A single settle-wide boolean let one crew
matching swallow another crew's unrouted call — a silent drop inside the
feature built to end them.

Two dedupe rules, one per shape of question. A hail that names an accused
**hop** (the stall hail) dedupes on that identity alone, **including
acknowledged rows**: answering the call is Marcin saying "I know about THIS
debt", and the timer reading the same hop a minute later stays silent — the
frozen rule "re-arms after the next hop" means a NEW hop, a new identity,
re-arms on its own. A hail with no hop keeps the older rule: at most one OPEN
call per crew, reason, station and flow run, and answering it clears the way
for the next. Two separate finishes are two separate runs and therefore two
separate calls, on purpose: collapsing them would hide the second parked loop
behind the first.

### 2c. The round budget and the stall clock (MAR-2759)

`session_crews.round_cap` (default 12) and `session_crews.stall_minutes`
(default 30) are **per crew**, because a loop belongs to a crew: one crew's
twelve rounds are another's two. Null means the default; a stored value that
could not have been meant falls back to it rather than disabling the guard.

The round cap and the 20-hop `MAX_AUTOMATIC_HOPS_PER_FLOW_RUN` are deliberately
both kept, because they answer different questions with different responses:
the cap says "this loop needs eyes" and **disarms nothing** while hailing, and
the hop budget says "this wire has run away" and disarms loudly. On the default
cap the backstop is unreachable; a crew that raises its cap above twenty gets
it back.

**They count different things, because they are different questions.** The
round meter is `countBudgetedHopsInCrew(crewId, flowRunId)` — the cap belongs
to a crew, and a session in two crews would otherwise spend one crew's rounds
against the other's budget and number its first row "round 2". The backstop is
`countBudgetedHops(flowRunId)`, the whole run across every crew, because a
runaway chain is a runaway however many rooms it passes through.

The round number is fixed once, above every guard that records a row, so the
number the ledger records, the number a refusal names and the number the
receiving station reads are one value. Which rows carry it: everything from the
round meter down — deliveries, `skipped-baton`, `skipped-already-fired`,
`skipped-round-budget`, `skipped-budget`, errors. The mute and failure rows
carry null on purpose: they are facts about the settle rather than beats of a
loop, and a round on them would claim they belonged to one.

The round is stamped **inside the brief** (`compileRelayPayload`'s third
argument), never onto a bare message -- a wire nobody briefed still carries the
message byte for byte, which is a standing tested promise.

The stall check is driven by a timer (`electron/main/relay-stall-clock.ts`),
not by a settle, because the whole failure IS the settle that never arrives. It
is its own module so it can be driven by fake timers: an untested
`setInterval` in the bootstrap is the one guard whose disappearance leaves
every gate green.

The question is **set-shaped and per station** -- _which stations still owe
which delivered work_ -- so `findStalledStations` reads the crew's whole trail
back to the one-hour live window (`listRecentHops`), never the newest row
alone: a failed station's own wires write `skipped-failed` refusals on top of
its stamped hop, and a healthy sibling in a fan-out writes newer rows forever,
and neither may bury a debt. Each station is judged by its newest **budgeted**
hop; rows that spent nothing are not debts. Several stations may hail in one
tick, and the hail book's per-crew/station/run dedupe already absorbs the
repeats. Outside the live window a loop is finished, not stalled.

Then it asks the question the clock is only a proxy for: **does this station
still owe the landed hop?** The answer is durable and lives on the hop:
`relay_hops.settled_at` / `settled_status`, written by
`RelayService.markStationSettled` from the station's own settle, above every
early return in `handleSettle` -- plumbing settles included, because the stamp
is **causal, by identity**. Each budgeted hop carries `relay_hops.dispatch_id`,
the receipt the session layer minted for its input, and a settle stamps
exactly the hops whose ids it names -- so an opener's finish can never stamp
the payload still queued behind it, a turn already running when the payload
queued cannot stamp it either, and a second queued payload stays owed until
its own turn ends. Durable in the ledger and in the queue row on purpose: the
receipt survives the restart that empties the engine's memory. Same event
source as the loop itself, so the two can never disagree: a settle the engine
never sees would have fired no wire either, and the call is right to stay
loud. (An earlier `settles_owed` count -- a guess from the target's status at
send time -- was dropped with the receipt's arrival; a count nobody reads
would only invite a reader.)

Only `completed`, `cancelled` and `abandoned` silence it. A station that came
back BROKEN stays loud with its own sentence -- a failed terminal station
writes no row, parks nothing and hails nothing, so this is its only alarm --
and so does a settle word this build cannot read. Neither waits for the
window: the window is the benefit of the doubt given to silence, and a hop
stamped `failed` (by the station's own broken settle or by the session layer's
`failed` terminal, below) has already answered, so the next tick calls it.
Rows written before the receipt existed (null `dispatch_id`) keep the old
first-answer reading with the `settled_at > fired_at` floor, which is exactly
what they knew.

**The receipt lifecycle invariant (MAR-2759, design P): every dispatched
receipt reaches exactly one terminal.** Four endings, and only four:

- `settled` — its turn ended; the settle event names it (above).
- `cancelled` — the user withdrew that one queued input. Quiet.
- `abandoned` — the user deleted the session that held it. Quiet.
- `failed` — the system could not run it. **Loud.**

A dispatch that ends short of a turn settles never and names nothing, so the
session layer -- the owner of the queue rows and the in-flight set -- emits
`DispatchTerminalEvent` (`onDispatchTerminal`) carrying the **exact** ids and
the word, and main hands it to `RelayEngine.handleDispatchTerminal`. The engine
releases only those batons (the run leaves `liveFlowRunIds` with its last
one), drops an opener claim among them, and `RelayService.markDispatchesTerminated`
stamps the hops that carried them with the terminal's own word, only where no
settle stamped first. Never a session-keyed eviction — the dispatch-set bound
forbids it and this shape does not need it: a sibling receipt queued into the
same station stays owed, its baton stays held, and its own settle still
continues its own run.

**Ownership is driven by every transition out of "carrying a turn," not by
settles alone.** The queue drains only on `completed`; every other way out
would leave rows waiting for a settle that is not coming, and each of them
now terminates the rows `failed` through one helper
(`SessionService.terminateQueuedInputs`):

- a **dispatch attempt failed** — `withDispatchInFlight`'s failure branch,
  the provider-barrier refusal. `isCarryingATurn` counts a send still on its
  way to the provider as a turn to queue behind (the MAR-2550 window); that
  is an attempt, not a turn, and it is safe only because its failure has this
  owner: the marker is cleared, and the rows are terminated unless another
  send or a live turn still carries them;
- a **stale run failed at the send door** (`markStaleRunningSessionFailed`);
- a **turn failed with rows queued** (`handleLifecycle`, status `failed`);
- a **drain that could not send** (`dispatchNextQueuedInput`'s catch) — the
  row being sent and every row behind it, in one event.

Termination over a quiet retry, by ruling: the failure that got here was not
transient as far as this process can tell.

**Commit-last terminals in `delete()`.** The receipts are read
non-destructively, the handle is stopped best-effort (a throw is logged, never
propagated), the row is deleted, and only then is the in-flight set consumed
and `abandoned` emitted. A delete that fails before the irreversible step
leaves ownership intact and emits nothing; the turn's settle still names its
receipts.

`failed` is the loud word everywhere it lands: `crew-hail.pure.ts` reads it
like a broken return and the stall clock calls it on the next tick, without
the window. What this invariant does NOT cover, on purpose: a restart. The
constructor's own recovery (`recoverStaleRunningSessions`,
`recoverDispatching`) fails rows before any listener can subscribe, and the
engine's memory is empty by then anyway; those hops stay unstamped and the
stall hail asks a human -- the documented restart shape, one alarm too loud.

Pinned by **the sweep** in `session.service.test.ts` ("THE SWEEP: every
dispatched receipt reaches exactly one terminal"): after each exit path --
completed, cancelled, deleted, dispatch-failed, stale-failed, turn-failed --
over the production composition, every receipt has exactly one ending, no
queue row waits, the engine holds nothing, and every hop that carried one
reads a fate. Removing any single terminal emission reds it at the path that
lost it. Site pins live beside it and in `relay.engine.test.ts` ("a cancelled
receipt reaches a terminal"): cancel, delete, the failed receipt hailed
without waiting, and two same-session receipts where ending one leaves the
other live.

### 3. The vocabulary law — write a union, read a string

`RelayHopOutcome` is the vocabulary this build may **write**. Everything that
**reads** a stored outcome takes a plain `string`, because a ledger row may
carry a word an older or newer Convergence used — v0.45.22 shipped a
`skipped-disarmed` this build no longer knows. Reads degrade to a neutral
label and a quiet tone; they never render blank and never turn a crew red.
Adding an outcome therefore means: the union, `relayHopTone`,
`formatRelayHopOutcome`, and — only if it is genuinely alarming —
`ALARMING_RELAY_OUTCOMES`. `CrewHail.reason` follows the same split for the
same reason.

The line between loud and quiet is whether anything is owed. `skipped-baton` is
grey: the wire is default-closed by design and did exactly what it was drawn to
do. `skipped-round-budget` is red: the loop is waiting on a human and has
hailed for one.

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
- **Clearing a trail is a read-model convenience over a load-bearing table.**
  Anything new that deletes from `relay_hops` must spare
  `RelayEngine.liveFlowRunIds()`, or it silently weakens the loop law.
- **A literal that crosses the tree boundary is duplicated, not shared — and
  the duplication needs a barrier, not two pins.** The renderer cannot import
  from `electron/`, so `BATON:` (`batonConditionToken`) and the two loop
  defaults live on both sides. A test on each side pinning its own literal is
  NOT an agreement: editing one side together with its own assertion leaves
  every suite green while the other side promises the old value. The barrier is
  `electron/backend/relay/cross-tree-agreement.test.ts`, the one test that
  reads both trees at once. Anything new that crosses this boundary owes a case
  in it.
- **Zustand selectors must return stable references.** Subscribe to the whole
  relay list and narrow with `useMemo`; selecting inside the subscription hands
  zustand a fresh array every render and spins.
- **An older trail page can outlive the trail it belongs to.** "Load older" and
  a clear are two answers about the same ledger, returned in either order, so
  `loadOlderHops` re-checks the crew's trail `generation` _and_ that its anchor
  is still the oldest row before applying a page. Without both, a clear landing
  mid-fetch puts the deleted rows straight back on screen.
