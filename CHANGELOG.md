# convergence

## 0.45.29

### Patch Changes

- 1adb5b5: A message you can send without waking the wires, and the wires themselves
  visible from inside the session (MAR-2537, MAR-2538).

  **The quiet send.** A session bound to a flow is meant to fire — but not every
  message is flow work. Typing `/compact`, typing `/clear`, or asking an ad-hoc
  question would carry that turn's last message down every wire leaving the
  session, spending provider quota and waking another agent mid-work. A **Quiet**
  toggle now sits in the composer's control row, and it appears only for a
  session something actually leaves. Switch it on, send, and the wires hold.

  It is per send and never sticky: the toggle switches itself back off the moment
  the message goes. Once the quiet work settles, the next ordinary send carries as
  usual, with nothing to remember.
  The Hail carries the same toggle, because the Hail _is_ the composer.

  Nothing is inferred. Convergence does not read your message looking for slash
  commands and silence itself — a wire that stops firing for reasons you did not
  ask for is worse than one that fires when you forgot.

  **A held wire still writes a row.** No silent hops, and no silent non-hops:
  each armed wire leaving the settling session records a quiet grey **held — sent
  quiet** row in the crew's trail, saying "This message was sent quiet, so the
  wire did not fire. It is still armed for the next one." No budget is charged, no
  chain is advanced, and nothing is disarmed.

  Quiet is scoped to the settle rather than to one message: if any message
  contributing to the finished work asked for quiet, the settle is quiet. That
  tie-break is deliberate — erring quiet costs one manual hail, erring loud spends
  quota and interrupts an agent, and those are not the same size of mistake. The
  request survives a restart, so a remote run that outlives the app and reattaches
  still honours the quiet you asked for before it.

  **The wires, from inside the session.** The session header now carries a small
  wire count whenever anything leaves that session; open it and each wire reads
  out in the same sentence the crew screen uses — "When Implementor finishes, send
  its last message to Reviewer". Disarmed wires are listed and read grey, so a
  switched-off wire is visible rather than merely absent. It is read-only: wires
  are still drawn, armed and deleted in Mission Control. A session nothing leaves
  shows nothing at all.

## 0.45.28

### Patch Changes

- 818e7c2: The relay hop trail can now be read further back and emptied safely, and the
  generated release-notes file stops living in git (MAR-2440, MAR-2408).

  **A trail you can read to the end.** A crew's Flow section showed the newest
  fifty firings and nothing else — everything older was in the database with no
  way to reach it. Open the trail and a **Load older** button now walks back
  through it fifty at a time, and it disappears the moment there is genuinely
  nothing behind it rather than showing you one last empty page. Paging older
  rows no longer costs you them: a wire firing while you read keeps the newest
  row at the top without throwing away history you deliberately loaded.

  **A trail you can empty.** **Clear trail** sits beside the hop count, and the
  first press only asks. The confirm says exactly what it is agreeing to —
  "Clear every hop? The wires and sessions stay." — because "clear" a few pixels
  from a switchboard could plausibly mean unwiring something. If the red ⚠ badge
  is up, the confirm adds "This also dismisses 2 alerts", so the one thing a wipe
  destroys unread is named before it goes. Clearing in one window clears it in
  every window.

  **Except what a running flow needs.** A flow still in flight keeps its rows,
  and the trail says so: "Kept 1 hop from a flow that is still running." That is
  not politeness. Convergence uses the ledger to know a wire already fired this
  run — it is what ends A → B → A at two hops instead of ping-ponging — so
  deleting a live run's rows would tell a wire it never fired and reopen the loop.
  The engine names the runs it is still carrying and the clear leaves those
  alone.

  **And the papercut behind the scenes.** `release-notes.generated.json` was a
  generated file that was also tracked in git, so every build rewrote it and left
  the tree dirty. It is a build artifact now, regenerated on demand by the
  commands that need it. Nothing user-visible changes; the release-notes dialog
  still shows the version you are on.

## 0.45.27

### Patch Changes

- f7160f6: A relay can now send a first message of its own — `/clear`, say — before the
  one it carries, which turns a long-lived session into a worker you recycle
  every lap (MAR-2529).

  **The recycled worker.** Draw a wire and the hail form offers a **First send**
  box: "e.g. /clear to reset the target before delivering". The wire then sends
  that message on its own, and the payload it was drawing — your instructions
  plus the finished session's last message — waits behind it and lands in
  whatever context the first message left. So a session that would otherwise
  fill up over a long run gets wiped and re-briefed by the same wire, over and
  over, instead of dragging every previous lap along with it.

  The wire says so out loud. Its sentence reads "When Implementor finishes, send
  its last message to Reviewer · sends /clear first", with the literal text
  rather than a vague "sends something first" — which command it is decides
  whether the target keeps its memory. The trail says it too: one hop row, whose
  preview reads "First send: /clear · then: …". A hop that wiped its target
  before delivering must never look like an ordinary delivery.

  One firing is still one hop, one charge against the loop budget, and one turn
  of the loop law — a wire that opens with a first send does not get to fire
  twice.

  **The transcript stops lying after a clear.** Convergence never erases what you
  have read, so until now a cleared conversation carried on looking continuous:
  the messages above were still on screen, and nothing said the model could no
  longer see any of them. A restarted conversation now draws a visible boundary
  across the transcript — "Context cleared — the conversation restarted fresh" —
  wherever it happens, whether a relay did it or you typed `/clear` yourself.

  The first send is plain text and its meaning belongs to whoever receives it:
  `/clear` is Claude's word, and on another provider the same box is simply a
  message that goes first. It is offered on wires that hail an existing session,
  since a wire that starts a brand new one has nothing to clear.

## 0.45.26

### Patch Changes

- 4000c4d: A relay chain now ends when it has been all the way round, and a wire can carry
  your own instructions above the message it delivers (MAR-2524, MAR-2525,
  MAR-2526).

  **A wire fires once per flow run.** Loops between sessions were always the
  point — A hands to B, B hands back to A is our own review loop — but nothing
  noticed when a chain had finished. A ping-pong kept going until the 20-hop
  budget killed it, twenty real provider turns later, and switched the wire off
  to do it. Now the second time a run reaches a wire it has already used, the
  wire declines: the trail shows one quiet grey row, "This wire already fired in
  this run; a wire fires once per run", and nothing is disarmed. A → B → A ends
  at two hops, with both wires still armed for next time. The hop budget stays
  underneath as a backstop for a long chain of different wires.

  Hailing a session yourself always starts a fresh run, so a conversation you
  pick up by hand tomorrow fires its wires again exactly as you would expect.
  Convergence now tracks which run a session's work belongs to as work is handed
  over, rather than guessing from the ledger — the old guess had no sense of time
  and would have treated a hail you typed a week later as part of a chain that
  finished long ago.

  **Instructions on the wire.** A relay used to carry only the raw last message,
  leaving the far end to work out what it was for. The add-relay form now has an
  optional Instructions box, for both kinds of wire: write "Take a look at this
  and tell me what you would change", and every hop arrives with that above the
  finished message, separated by a blank line. The wire's sentence gains a quiet
  "· with instructions" so a briefed wire says so at a glance, and the hop trail
  records what was actually sent rather than what the source session happened to
  say. Leave the box empty and the wire carries exactly what it always carried.

  Also: an explanation under a trail row now takes that row's own colour, so a
  wire behaving correctly no longer reads in alarm red. For anyone extending the
  flow layer, `docs/architecture/relay-engine.md` writes down the laws and the
  seams a new trigger, action or payload transform actually lands on.

## 0.45.25

### Patch Changes

- b5f6455: Relays and review sessions now run on the account you enrolled, instead of
  whichever credential happens to be signed in on the machine (MAR-2509).

  Enrolling accounts was meant to end work being billed to the wrong
  subscription, but only the composer ever honoured the enrolled default. Every
  turn Convergence started by itself — a relay carrying a message onward, a
  session a wire opened, a pull request review — quietly ran on the ambient
  `~/.claude` credential. Those hops failed for anyone whose real work lives on a
  different account.

  A hop now rides the account its target session has been using: a relay is
  another turn in a conversation already under way, not a new relationship, so it
  does not change who is paying for it. A session with no turns yet, and a session
  a wire opens from nothing, take the enrolled default for their provider — the
  same one the composer would have preselected. With nothing enrolled, everything
  behaves exactly as it did before.

  A wire that starts new sessions can now name the account those sessions are born
  on, chosen with the same picker the composer uses, and offered per provider like
  the model and effort already are. It has to be chosen up front rather than
  corrected later, because a session's credential is fixed the moment its first
  turn begins. When a wire names an account explicitly, its sentence says so —
  "start a new session called Reviewer — codex in Convergence · as you@example.com"
  — so a wire that spends a particular subscription says which one out loud. A
  wire that names none stays quiet about it, because "the enrolled default" is
  resolved when the wire fires and naming today's default would be a promise the
  wire has not made.

  Sessions on remote execution hosts continue to run on the ambient credential,
  which is the only thing a remote host can use.

## 0.45.24

### Patch Changes

- 8cbc252: The Canvas now wears the room's theme instead of the drawing library's
  (MAR-2480).

  React Flow ships its own light and dark styling, and nothing had told it which
  one we were in — so the zoom and fit controls sat on the canvas as a stock white
  panel, visibly borrowed from somewhere else. They now follow the titlebar
  toggle live, switching the moment you switch, and their colours are the app's
  own: the same surface, border and text tokens the rest of the chrome uses,
  rather than the library's greys.

  The rest of the canvas was swept in both modes at the same time, which turned up
  things that only went wrong in the light one. A disarmed wire was drawn in a
  flat white and was therefore invisible on a light canvas — it now takes a colour
  that resolves against whichever theme is on. The crew boxes, the spawn chips and
  the wire popover had borders that assumed a dark background and faded out on a
  light one. The dot grid had an opacity layered on top of an already-faint colour
  and disappeared entirely in light mode.

## 0.45.23

### Patch Changes

- 36ada5e: Mission Control has a third view: the Canvas, where a crew's Flow is drawn
  rather than listed (MAR-2441).

  Flat lays every session in one grid, Crews groups them into their containers,
  and Canvas draws the crews that have wires. Sessions appear as live nodes
  wearing the same attention colours and status dots they wear on their cards, so
  one session reads the same whichever view you are in. Crews are boxes around
  them, carrying their emoji and their accent. Sessions in no crew are not on the
  canvas at all — the canvas is about flows, and a session in no crew is not in
  one.

  Relays are drawn as arrows from the session that finishes to the session that
  receives. A live wire takes its crew's accent colour, or emerald if the crew
  never chose one; a disarmed wire is grey and dashed, always, so switched-off can
  never be mistaken for a crew that simply picked a quiet colour. A wire that
  starts a new session points at a dashed chip naming what it will open — which
  provider, which model — because a wire has to end somewhere and the session it
  promises does not exist yet. Once it fires for real, the session it made appears
  as an ordinary node.

  Loops are drawn as loops. The layout runs left to right along the wires, and the
  returning half of a review loop leaves and arrives along the underside instead
  of lying on top of the wire it answers.

  The canvas is live. When a wire fires, it thickens and its dashes march for a
  moment, so you can watch work being handed along from across the room. A firing
  that errored or burned its hop budget flashes red instead, overriding the crew's
  own colour — a crew that picked a pretty accent cannot make its failures subtle.
  Clicking a wire opens what it is, in the same sentence the crew container uses,
  with its recent hops underneath in the same rows the trail uses. Clicking a
  session opens it, exactly as clicking its card does.

  This view reads and never writes. There is no connecting, no dragging wires into
  place, no editing a relay from the canvas — wires are drawn where they are
  authored, in the crew. Node positions are computed from the data rather than
  stored, so two windows showing the same crew always agree.

  Also: a disarmed wire whose session finishes no longer writes a ledger row. "No
  silent hops" was always about firings you cannot see, not about a switch at rest,
  and journalling every session that finished near a switched-off wire buried the
  rows that mattered (MAR-2437, MAR-2438). Trails recorded by earlier versions
  still read: an outcome this build does not recognise shows as a neutral "unknown
  outcome" with the original word on hover, rather than going blank or raising a
  false alarm.

  Adds `@xyflow/react` (React Flow v12) as a dependency, used only by the canvas.

## 0.45.22

### Patch Changes

- a054363: Crews can now carry Flows: named wires that hand work from one session to the
  next, with Convergence doing the carrying (MAR-2437, MAR-2438).

  A relay is one wire. When the session it listens to finishes, its last assistant
  message is carried somewhere — either into another session in the same crew, or
  into a brand new session the relay opens and starts on that message. That is the
  whole vocabulary. Agents never call agents; Convergence is the switchboard, and
  it only ever moves a message because you drew a wire telling it to.

  Relays live inside a crew and are read as sentences, not configuration. "When
  Implementor finishes, send its last message to Reviewer" is the whole row, with
  its arm switch sitting right at the front of it. Arming and disarming is one
  click and never buried in a menu, because a wire that sends real prompts to real
  providers should be as easy to switch off as a light. Nothing is armed that you
  did not arm.

  The authoring form is laid out as the sentence it will become. Both ends are
  picked from the crew's own members, so you cannot draw a wire the engine would
  refuse — and when something is still missing, the form says which in plain
  words rather than leaving a dead button. A relay that starts a new session says
  exactly what it will open: which provider, which model and effort, which project
  or none at all, and what it will be called. The session it opens joins the crew,
  so it never appears from nowhere.

  Loops are allowed on purpose. A wire from A to B and back from B to A is a
  review loop, which is the point. The guard is a budget rather than a ban: twenty
  automatic hops in one run, after which the relay disarms itself loudly and says
  so. One click re-arms it.

  Every firing is written down — deliveries, new sessions, skips and failures
  alike. Each crew keeps a hop trail, newest first, with the reason attached to
  every skip and the error text of every failure shown outright rather than hidden
  behind a click; only the carried message folds away. A crew whose wires errored
  or hit the budget is outlined in red and badged with a count, visible from
  across the room without opening anything, and the trail grows live as wires
  fire. Session cards wear a small wire glyph so you can see at a glance what is
  connected to what.

## 0.45.21

### Patch Changes

- 01be4b1: Sessions can now be gathered into crews, and Mission Control can be laid out by
  them (MAR-2434, MAR-2435).

  A crew is a named, decorated collection of sessions that crosses projects — a
  mastermind in one repository can ride with workers in three others. Membership
  is many-to-many: a session belongs to as many crews as you like, and joining one
  is never leaving another. Crews promise membership and nothing else. There is no
  automation here, no dispatch, no relay; a crew is a way to see your work
  arranged the way you actually think about it.

  Every session card gains an "Add to crew" gesture. It toggles like checkboxes
  and stays open, so a session can join several crews in one pass, and you can
  make a new crew right there — name, emoji, accent colour — with the session you
  started from already in it. The colour is not decoration for its own sake: it
  becomes the crew's container border, its filter chip and the badges on every
  card that belongs to it, so a crew is recognisable across the room before you
  read a word.

  Mission Control gains a Flat | Crews toggle. Flat is exactly the room you
  already know. Crews lays the same cards out inside bordered containers, one per
  crew, with a "No crew" section at the end so nothing ever disappears by
  switching layouts — and a session in two crews honestly appears in both. Each
  container header renames, redecorates or deletes its crew; deleting says plainly
  that the sessions stay exactly where they are, because a crew is a label and
  never an owner.

  Crew also joins the filter row as a fifth dimension, alongside states, projects
  and providers, wearing each crew's accent. Like the others, each chip carries a
  live count of what turning it on would reveal, and all five narrow together.
  Which crews you have picked, and which layout you left the room in, are
  remembered across restarts.

  Crews live in the database rather than in browser storage, so they survive, and
  every window updates the moment one changes.

## 0.45.20

### Patch Changes

- 6dd80b5: Hailing a session from Mission Control now gives you the whole composer
  (MAR-2428). Not a text box that can only send words — the same composer you
  type into inside a conversation, with attachments, skill selections, delivery
  modes, provider accounts and context mentions, and the same honest label
  telling you what the send will do before you do it.

  It opens in the room rather than on top of it: a panel that slides in directly
  beneath the row of the card you hailed, leaving every other agent where it
  was. Hail the same card again to close it. Cards from projects you do not
  currently have open can be hailed too — the composer follows the session, not
  the project you happen to be looking at.

## 0.45.19

### Patch Changes

- 2613c1e: Mission Control can now be shaped, not just searched (MAR-2427). An ordering
  selector lays the room out four ways — Attention first (the unchanged
  default), Working first, Recent first, By project — and a filter row narrows
  it: five state chips (Working / Needs you / Idle / Finished / Failed) plus
  searchable project and provider pickers. Every control wears a live count of
  what it would reveal, and search, chips and pickers all compose. The ordering
  and filters you pick are remembered across restarts; the search box is not,
  so every launch starts on the whole room.

## 0.45.18

### Patch Changes

- f22b7d4: Internal: `npm run dev:sandbox` starts a dev instance on its own isolated
  data directory, so it can run — and restart freely — beside the stable app
  without the two marking each other's live sessions as failed (MAR-2426).
  `npm run dev:seed` fills that sandbox with a consistent snapshot of the real
  app's database and attachments, taken safely while the stable app keeps
  running. The two-instance iteration ritual is documented in
  `docs/runbook/dev-sandbox.md`.

## 0.45.17

### Patch Changes

- 79e5439: The Claude Code usage pill is retired, and the app stops burning CPU to
  compute it (MAR-2401).

  Convergence had no way to ask Claude Code what your usage was, so it worked it
  out the only way available: by re-parsing the transcript store that every
  Claude account on the machine shares. On a heavy week that store is enormous,
  and the composer asked for a fresh answer every two minutes — which is why the
  fans came on and stayed on while a Claude session was open. The numbers were
  never worth what they cost to produce, and they were machine-wide rather than
  per-account anyway.

  So the pill is gone, and with it the whole calculation behind it. Settings →
  Usage still lists Claude Code, but now it says plainly that Convergence cannot
  read these limits and links to the Claude usage page, the same way Cursor and
  Antigravity already did.

  Nothing else in that corner of the composer moves. The context-window dot, its
  popover, and Compact context are a separate mechanism and behave exactly as
  before. Codex usage is untouched: it reads real limits from Codex's own
  authenticated endpoint, has never parsed a log, and keeps its pill and popover.

## 0.45.16

### Patch Changes

- 24f0cdd: Mission Control: every agent on one screen, and a voice to reach them
  (MAR-2394, MAR-2395, MAR-2396).

  A new view shows every session across every project at once, as cards. A card
  is not the conversation — it is the agent working: what it is, which project,
  which provider and model, and a live line saying what it is doing right now
  ("running tool: Bash", "writing response…", "compacting context…", "waiting
  for approval"). Sessions that need you frame themselves so you can tell them
  apart across the room without reading a word. Clicking a card opens its
  transcript, which stays the place you go for detail.

  Search narrows the cards as you type, across name, project, provider, model,
  status and activity. It does not read conversations — that search is a
  different thing, and this one says so. The room orders itself the way the work
  actually queues: agents blocked on you first, then work that finished or
  failed and hasn't been read, then agents still running, then everything at
  rest.

  And you can speak to any session without opening it. Hail a card, type, send —
  and the composer tells you plainly what the send will do before you do it:
  starts a new turn, queues behind the current turn, delivers into the current
  turn, steers it, or answers the question it is holding. If the session starts
  running while you are still typing, the label changes under your hands. After
  sending you stay exactly where you are, watching the card react.

## 0.45.15

### Patch Changes

- 03388dd: Stop killing Codex sessions that were about to recover (MAR-2315, MAR-2316,
  MAR-2317). "Reconnecting... 2/5" is Codex's own retry notice, not a death
  rattle — Convergence used to treat it as fatal and shut the process down
  mid-retry, which is why a network blip so often ended in "Process exited with
  code 1". A retry now leaves a warning note and the turn carries on.

  Nothing sits on "running" forever any more. Every request to the Codex
  app-server has a patient budget measured in silence rather than total time, so
  a stalled server is noticed while a long turn is left alone, and a connection
  that dies takes the session back to a clean respawn instead of leaving the
  composer blocked with nowhere to write.

  When a Codex process does die, the session says why: the exit note now quotes
  what the process printed on its way out instead of showing a bare exit code, a
  process that vanishes mid-turn is reported instead of ignored, and an approval
  that was waiting on you ends with the process rather than staying stuck on
  "needs approval" with a button that does nothing. A resumed session also
  resumes its thread properly after a respawn, instead of asking a fresh process
  to continue a conversation it has never seen.

## 0.45.14

### Patch Changes

- 2c0ebaa: Your response to a quoted passage no longer renders as part of the quote
  (MAR-2280). When you annotated an agent's message and sent it, your own words
  came out inside the quote block — looking, and reading, like something the
  agent had said rather than your answer to it. Markdown pulls a line directly
  under a blockquote into that blockquote; the compiled message now leaves a
  blank line, so each quote stands on its own and your response sits beneath it
  as your own paragraph. The "(from your earlier message)" label still sits
  directly above the quote it belongs to.

## 0.45.13

### Patch Changes

- 29296dc: Answer the agent where it spoke (MAR-2258, MAR-2259). Select any part of a
  finished agent message and a small bar appears: react with an emoji, or write
  a comment about that passage. Each one becomes a chip above the composer, and
  they wait there while you keep reading — so a reaction to paragraph two
  survives to paragraph ten instead of being lost on the way down. Chips can be
  edited or thrown away before they go.

  Sending turns the quotes and your responses into one ordinary message: every
  excerpt blockquoted above what you said about it, quotes from older messages
  labelled as such, and whatever you typed in the composer at the end. That
  message is what appears in the transcript, verbatim — what you read back is
  exactly what the model read. Sending with an empty composer and a full tray
  works; selecting three passages and hitting send is a complete thought.

  Messages still streaming offer nothing to select, and a message with no
  annotations is sent exactly as it always was.

## 0.45.12

### Patch Changes

- d6a30a4: Internal: the session send/create chain takes named options instead of long
  positional argument lists (MAR-2227). `createAndStartSession` was fourteen
  positional parameters, `createAndStartGlobalSession` ten and
  `sendMessageToSession` seven, which is how call sites ended up reading
  `undefined, undefined, null` and why the composer branched four ways just to
  skip past optional arguments it had nothing to say about. Behaviour is
  unchanged; the next session-scoped setting is now additive rather than a
  rewrite of every caller.

## 0.45.11

### Patch Changes

- 5e843ec: The Authorize button on a connector now works (MAR-2251, PA11.1). Claude Code
  refuses to authenticate over piped input — "stdin isn't a terminal" — so
  Settings → Accounts → Connectors ran a ceremony that could never finish. The
  authorization now runs on a real terminal, still under the selected account's
  own environment, so the browser opens, the tokens land in that account's slot,
  and the row is re-read from the provider afterwards rather than assumed. A
  login that prints a refusal is reported as a failure even when it exits
  cleanly, and one nobody finishes is stopped after five minutes with the
  connector named.
- 58ed6d4: Local model tunnels no longer lose a start failure, or take it out on the
  main process (MAR-2250). Starting a tunnel keeps working in the background
  after the UI gets its "starting" snapshot, and that background work held no
  failure handler: anything it threw became an unhandled rejection while the
  profile sat on "starting" forever. It now lands in the profile's status,
  named. Health probes answer "I could not tell" instead of throwing when their
  transport fails, and a monitor pass that overlaps a status change no longer
  writes its stale view back over it — a failure recorded mid-probe used to
  come back as a bare "stopped" with no error at all.

## 0.45.10

### Patch Changes

- 9a60924: The test suites that drive a real `git` now spend a named time budget instead of
  vitest's 5s default (MAR-2130, MAR-2248). They init bare repositories, fetch
  between them and create worktrees on disk — which is exactly what they exist to
  verify — so their wall-clock time depends on machine load rather than on the
  code under test, and under the full suite they periodically timed out with a red
  that said nothing about the product. Internal only; no behaviour change.
- be95cc7: Connectors follow the account (MAR-2249, PA11). Each Claude account now has a
  Connectors panel in Settings → Accounts that asks _that account_ what it can
  reach and authorizes an MCP server through its own credential slot — so the
  tokens land where the account will actually look for them, once, and survive
  every later swap. When a turn hits a connector the running account has not
  authorized, the transcript no longer shrugs: it names the server and the
  account and offers a control to fix it, and says plainly when the session
  cannot open a browser instead of pretending an action will work.

## 0.45.9

### Patch Changes

- 30abd94: Codex accounts ride the same rails as Claude ones (MAR-2207, PA9). Enrol a Codex
  account and it gets its own `CODEX_HOME` with a `0600` `auth.json` inside it,
  the same domain model, the same fail-closed identity attestation, and the same
  allowlisted child environment — an inherited `OPENAI_API_KEY` can no longer
  outrank the account you picked. Codex quota is now read from the selected
  account's own home and cached per account and host. The composer only offers
  accounts belonging to the session's provider. Because Codex holds one
  `app-server` for a whole session rather than spawning per turn, changing account
  mid-session is refused with an explanation instead of being silently served by
  the account already running.
- 97c3be3: Provider accounts get a settings surface (MAR-2204, PA6). Enrol, rename, set
  default, reconnect and remove Claude Code accounts from Settings → Accounts
  instead of the developer console, listed by identity — email and organization —
  with the attestation net's verdicts shown on the account they concern. The
  stored plan now reads the subscription tier only: it used to fall back to
  `organizationRole`, which reported "admin" for a Max account, and a verified
  attestation refreshes it so an already-enrolled account heals itself.
- bea5ff7: Claude's own rate-limit signal now reaches the usage surfaces (MAR-2206, PA8).
  Convergence used to discard the `rate_limit_event` Claude sends on every turn,
  so the app could sit at a weekly limit without being able to say so. The reading
  is now filed against the account that served the turn — keyed by execution host
  and account, so two accounts never read each other's numbers — and shown on the
  composer usage pill and in Settings → Usage. It reports the state, the window
  and the reset time in words: the event carries no utilization percentage, and
  none is invented. Display only; nothing rotates accounts on your behalf.
- a5e364d: Remote sessions refuse a local account instead of quietly ignoring it
  (MAR-2208, PA10). Provider accounts live on this machine and the execution-host
  wire protocol carries no account reference, so a remote session always runs on
  the remote host's own credential. It now says so: the composer replaces the
  account picker with "Default account · local only" and its reason, no selection
  is sent, and the backend refuses a remote turn that names one before anything is
  spawned or recorded — rather than running on a credential nobody chose while
  attributing the turn to one they did.

## 0.45.8

### Patch Changes

- fea503b: The composer can now pick which Claude account serves the next turn. Accounts
  appear beside the model picker by email and organization — an account is
  identity and entitlements, not an anonymous slot — and switching mid-session
  continues the same conversation on the newly chosen account from the next turn
  onward. The picker locks while a turn is still in flight, shows accounts that
  identity attestation disabled without offering them, and defaults to the login
  this machine already had, which behaves exactly as before.

## 0.45.7

### Patch Changes

- a42589f: Every Claude turn now records which provider account served it, and holds that
  account for the whole logical turn — including deferred-tool answers and
  recovery restarts, which continue on the account that started the work rather
  than whatever is selected when they happen. Turns taken with no account
  selected behave exactly as before and are recorded as the default account. An
  account that identity attestation disabled stops receiving turns instead of
  being spent silently.
- 1cb8a9d: Claude provider accounts can now be enrolled, removed and attested. Enrolment
  creates an isolated credential namespace, shares the whole agent profile by
  symlink, and captures identity from the account's own configuration. A
  fail-closed attestation pass disables an account that starts serving a
  different identity, reports account-directory entries a future Claude release
  invents, and warns when shared settings supply a credential that would make
  account selection decorative. Provider status shows enrolled accounts by email
  and organization; enrolment itself is a developer-console trigger until the
  settings surface lands.

## 0.45.6

### Patch Changes

- 9f0a6cd: Every Claude process Convergence spawns now resolves its environment through one account-aware boundary. With no account selected, behaviour is byte-identical to before; this is the plumbing that later releases' account selection stands on.
- 51b701a: Internal groundwork for multi-account provider support: the ProviderAccount domain model and storage land behind the scenes. No user-visible changes — account enrolment and selection arrive in later releases.

## 0.45.5

### Patch Changes

- 3dda0ec: Guided reviews and remote daemon reviews now prefer the current GPT-5.6 Codex models instead of naming retired ones. The preferences pointed at `gpt-5.6` (an alias OpenAI no longer serves) and `gpt-5.3-codex`, so Convergence quietly fell back to whatever was listed first rather than picking the intended flagship.

  The last two provider handshakes that still identified Convergence as version `0.0.0` — the Codex app-server used for skill discovery, and Cursor's ACP connection — now report the real app version.

- 810c118: Fixes Pi sessions hanging forever on older Pi installs. Convergence marks a Pi run finished when Pi reports it has fully settled, but that signal only exists in Pi 0.80.4 and later — on anything older the session sat "running" indefinitely. Convergence now checks the detected Pi version and falls back to the previous completion behaviour below that floor, so sessions always finish.

  The provider status panel now flags a Pi install that is too old to report completion accurately, and explains why an installed provider is degraded instead of only showing a badge.

- aeb1d72: Codex usage limits are now fetched once even when several parts of the app ask at the same time. Each cold read spawns a Codex app-server and can take up to half a minute, so concurrent requests previously meant several processes and several round trips for the same answer.

  When the usage RPC fails and Convergence falls back to the older path, the RPC's own error is now recorded in provider debug logs instead of being discarded, so a broken quota path can be diagnosed.

## 0.45.4

### Patch Changes

- 5429a19: Codex usage limits now come from Codex's own `account/rateLimits/read`, which answers from the CLI's authenticated session, instead of reading your access token out of `~/.codex/auth.json` and calling an undocumented chatgpt.com endpoint with it. The old path remains only as a fallback for Codex builds that do not support the method.

  Pi sessions no longer display the Codex usage pill — Pi bills through its own credentials, so Codex's quota was never that session's quota.

  The Claude model picker no longer shows two rows both labelled "Claude Fable 5"; the alias now reads "Claude Fable", matching how the Opus, Sonnet, and Haiku aliases are already named.

## 0.45.3

### Patch Changes

- c9f04f3: Codex sessions survive unrecognised app-server requests instead of dying: Convergence still declines the request, but now logs a warning note in the transcript and keeps the session running. Codex handshakes also report the real app version rather than `0.0.0`.

  Codex's `ultra` reasoning effort (the multi-agent switch on GPT-5.6 Sol and Terra) is now selectable in the composer, and the fallback model catalog matches what codex 0.145 actually serves — real 272k context windows, no models OpenAI has retired.

- 1e060ed: Pi sessions now report "done" only when Pi is actually done. Completion is keyed on Pi's `agent_settled` signal instead of `agent_end`, so a session no longer shows as finished while Pi is still auto-retrying, re-prompting after an overflow compaction, or draining a queued follow-up. Pi extension failures surface as warning notes instead of passing silently.

  Pi thinking levels now come from each model's own gating rather than a guess: Anthropic models expose `xhigh` and `max` when they support them, and selecting `max` sends `max` to Pi instead of being silently downgraded to `high`.

## 0.45.2

### Patch Changes

- 0de5bd4: Add Claude Opus 5 (claude-opus-5) to the Claude Code provider model catalog with a 1M context window and low–max effort options, include it in context-window estimation, and make Opus the default Claude Code model.

## 0.45.1

### Patch Changes

- aac61f1: Add manual context compaction from the session context popover for Codex, Pi, Claude Code, and Cursor, with capability guards for unsupported and remote sessions.

## 0.45.0

### Minor Changes

- c63e54e: Render custom app deep links in agent messages and open them with their registered desktop applications.

## 0.44.4

### Patch Changes

- 51553d8: Reduce long-running memory and CPU use by disposing completed provider runtimes, cleaning turn snapshots, and only streaming bounded provider debug data while its drawer is open.

## 0.44.3

### Patch Changes

- 0ebaf80: Update the Codex provider fallback catalog to GPT-5.6 models and add a repo-local skill for future provider model refreshes.

## 0.44.2

### Patch Changes

- b05db1c: Add Claude Sonnet 5 to the Claude Code model catalog.

## 0.44.1

### Patch Changes

- 9460d8b: Fix provider updates (e.g. Codex) failing with "Could not find npm for the detected install" when global packages are installed under a custom npm prefix such as `~/.npm-global`. The updater now resolves npm from the prefix-local path with a PATH fallback and pins the install to the owning prefix with `--prefix`.

## 0.44.0

### Minor Changes

- 7a39d76: Add a project clone flow to Open a project so users can enter a Git URL, choose a destination folder, and register the cloned repository without leaving the app.

## 0.43.1

### Patch Changes

- a4f2f55: Refactor provider quota and session runtime boundaries by routing quota reads through a unified provider source facade, migrating usage UI to the unified snapshot API, and extracting queued input and liveness responsibilities out of `SessionService`.

## 0.43.0

### Minor Changes

- b42e240: Session fork redesign: the structured-summary strategy no longer auto-runs the
  LLM extraction (explicit "Generate summary" button), and the additional
  instruction is now a composer-style editor — multiline input, image/file
  attachments (paste, drag-drop, file picker), and inline "run-with"
  provider/model/effort selection. The summary can be generated with a separately
  chosen "summarize-with" model/provider/effort. Seed attachments are carried
  into the forked session.

## 0.42.1

### Patch Changes

- 7e9c2f2: Harden Electron navigation, Git diff/fetch inputs, workspace env sync, and attachment ingestion against local file disclosure and option injection paths.

## 0.42.0

### Minor Changes

- a45c58e: Persist the skill catalog so opening the Skills dialog and the composer skill picker is instant after the first scan. Each provider adapter is now wrapped in a SQLite-backed cache-aside decorator: filesystem providers (Claude Code, Pi, Antigravity) invalidate by a cheap content fingerprint that detects added, removed, or edited skills on the next open, while RPC providers (Codex, Cursor) cache for a 5-minute TTL instead of re-spawning on every open. The dialog's Refresh action force-bypasses the cache, and only successful scans are cached so a transient failure never sticks.

## 0.41.1

### Patch Changes

- f5e5090: Polish the Skills dialog. The detail header is now a single full-width column (description spans the whole panel), with the chips hard-left and the action cluster hugging the right edge on one bottom-aligned row; the three copy icons collapse into a single **Copy ▾** menu (name / SKILL.md path / invocation). The dialog and detail slide-over are larger on big screens while still clamping to the viewport on small ones. Selection behaviour is tighter: the **Overview** clears the selection (so the footer path no longer lingers there), Grid and List preserve it, and returning to **Grid** with a skill selected re-opens its detail slide-over.
- fa62826: Make project skill discovery faithfully match the provider CLIs. The per-provider "project" scope walk previously climbed every ancestor up to the filesystem root, so skills in `~/.agents/skills` (and similar) were tagged project-local just because the home directory is an ancestor of the repo — most visibly, Antigravity claimed every `~/.agents/skills` skill as a project skill.

  A shared `collectProjectAncestorSkillRoots` helper now resolves project skills from the working directory **up to and including the git repository root, then stops** — mirroring how the CLIs scope project skills (Codex scans up to the repository root; Claude Code uses the project root). The home directory is a hard ceiling. So the **Project** bucket reflects only skills inside the repository, and home-level skills surface as **Global** via each provider's fixed global roots.

## 0.41.0

### Minor Changes

- 797a47d: Redesign the Skills dialog into a management surface. It now opens on an **Overview** dashboard (totals, breakdown by origin — project / global / plugin / built-in — by provider, and a "needs attention" list), adds a card **Grid** with provider/scope/readiness grouping alongside the existing **List** view, and surfaces skill origin as a first-class colour-coded dimension with a new origin filter and precise per-warning-code filtering. Drilling from a dashboard card applies a single fresh filter and returning to the overview clears it.

  The detail pane gains tooltip-labelled actions: **Reveal in Finder**, **Open SKILL.md**, and an **Open in editor** menu (Cursor / VS Code / Zed / WebStorm / Finder), with a loading spinner while a shell action is in flight. Provider discovery errors now show their actual message.

  Provider scanning is resilient: Codex scans are cached with a TTL (a timeout is never cached) and run on a longer budget, and providers now **stream into the dialog as each one resolves** — fast filesystem providers appear immediately while slower ones (Codex) fill in behind a "loading more" indicator. The detail slide-over animates in and out with a spring (via `motion`), and the dialog gets typography polish (tabular numbers, balanced/pretty text wrapping, scale-on-press).

## 0.40.28

### Patch Changes

- 6724cf6: Improve local model tunnel management with editable SSH route candidates, route-aware health diagnostics, and clearer handling for externally managed Ollama endpoints.

## 0.40.27

### Patch Changes

- 4fc5a75: Add a Claude Code usage pill to the composer using local ccusage data.
- 18f270e: Show Today, Yesterday, or a full date in transcript message timestamps.

## 0.40.26

### Patch Changes

- cdca4e0: Fix Claude Code usage loading in packaged apps by resolving bundled ccusage binaries from app.asar.unpacked.

## 0.40.25

### Patch Changes

- 19e23c9: Session details for remote sessions now show where the run actually lives: the repository and branch the daemon materialized, and the pull request it opened when auto-PR fires.

## 0.40.24

### Patch Changes

- 35b3eab: Remote session failure notes are now actionable: they include the HTTP status and a hint matched to the failure kind (auth problems point at the token in Settings, unreachable daemons point at Test connection, configuration gaps point at the Remote execution host section).

## 0.40.23

### Patch Changes

- 499a3ce: Remote sessions now survive app restarts: running remote sessions are no longer marked failed on launch — Convergence reattaches to the daemon's event stream and resumes after the last processed event, replaying anything that happened while the app was closed.

## 0.40.22

### Patch Changes

- e9eb31a: Remote sessions now tolerate roughly 2.5 minutes of daemon/gateway outage before the event stream is declared lost (previously ~30 seconds), pairing with the daemon's new SSE keepalives so idle sessions waiting on approvals survive reverse-proxy timeouts.
- 625f70f: Remote sessions are now visibly remote: a cloud "Remote" chip in the session header, an "Execution host: Remote daemon" row in Session details, and a cloud icon on remote sessions in the sidebar tree.

## 0.40.21

### Patch Changes

- 4f13c6d: Fix remote session starts for repositories with SSH origin remotes: the workspace source sent to the remote execution host now normalizes git@github.com and ssh:// GitHub remotes to the https form the daemon clones with. Non-GitHub origins fail upfront with the clear "requires a repository the daemon can clone" error instead of a daemon-side failure.

## 0.40.20

### Patch Changes

- 22b6b4a: Add a "Remote" toggle to the composer for new project sessions: when a remote execution host is configured and the selected provider has a daemon counterpart, the session can be started on the remote daemon instead of this machine. This completes the user-facing path for remote session execution.

## 0.40.19

### Patch Changes

- 5043df6: Fix Claude Code usage loading in packaged apps by preparing the bundled ccusage native binary before spawning it.

## 0.40.18

### Patch Changes

- f591d84: Sessions can now target an execution host: a new per-session `executionHost` field ('local' default) routes session starts, capability checks, and continuation handling to either the in-process LocalExecutionHost or the remote agents daemon. Remote sessions translate the provider id to the daemon's namespace and send a workspace source derived from the repository's origin remote so the daemon can clone it. Backend only — the session creation UI toggle lands next.

## 0.40.17

### Patch Changes

- 2a72027: Add Remote execution host settings: daemon base URL in App Settings, API token in Keychain, and a connection test that reports configuration, reachability, auth, and the daemon's provider listing. The RemoteExecutionHost is now constructed at startup from these settings; session host selection comes next.

## 0.40.16

### Patch Changes

- 9a32b1d: Add the RemoteExecutionHost adapter: runs Providers on an agents-daemon over the execution host wire protocol (POST start, SSE events with sequence-resumed reconnects, posted command envelopes), passing the same contract suite as the local adapter. Not yet wired into session flows.

## 0.40.15

### Patch Changes

- 1d88286: Extract the Provider Execution Host seam (interface, local adapter, contract tests) and define the versioned wire protocol for future remote provider execution. Internal refactor with no behavior change.

## 0.40.14

### Patch Changes

- f60503d: Show Claude Code weekly and current 5-hour local usage from ccusage in Settings usage.

## 0.40.13

### Patch Changes

- 07ed1b4: Add local model runtime monitoring and distinguish local Ollama from SSH tunnel endpoints.

## 0.40.12

### Patch Changes

- 1d11d7a: Codex fast mode is now off by default for new sessions and when switching to the Codex provider, since the fast service tier costs 1.5x a normal request. It remains a manual opt-in via the Fast toggle in the composer.

## 0.40.11

### Patch Changes

- 1e81a0b: Improve conversation image attachment previews so multiple images can share a responsive row before wrapping.

## 0.40.10

### Patch Changes

- d8f7089: Update the Claude Code provider model catalog with Fable 5, Opus 4.8, and current Claude Code model aliases.

## 0.40.9

### Patch Changes

- 5c62e2d: Add a Codex fast mode toggle to the composer and persist the selected service tier for new sessions.

## 0.40.8

### Patch Changes

- b7b1a54: Keep Pierre's virtualized diff root as the scroll container so long guide diffs render beyond the initial viewport without disabling virtualization.

## 0.40.7

### Patch Changes

- 2e5d72b: Extract a shared `DiffFileHeader` for code review diffs so guide mode shows one file header with the AI reason as the subtitle instead of duplicating the path.
- b09e2af: Add a collapsible guided review section rail so narrow review layouts can keep the walkthrough content focused while section movement happens by scrolling.

## 0.40.6

### Patch Changes

- 05694e9: Fix guide-mode code review diffs so long files render completely instead of appearing cut off after the first virtualized chunk.

## 0.40.5

### Patch Changes

- f49cff3: Add remote agents-daemon support for guided review generation, including app settings for the daemon URL and API token, remote model resolution, local persistence of returned guides, and visible local/remote generation status labels.

## 0.40.4

### Patch Changes

- dc34b75: Add expandable diff context controls and capture richer Git diff context so reviewers can reveal more unchanged lines above or below changes.
- b372c23: Polish code review guide navigation with section-aware file jumps, active section handoff, and clearer guide generation states.

## 0.40.3

### Patch Changes

- 10b2e30: Condense the Settings dialog: each control now sits on a single line with its description moved into a hover tooltip, and section headers drop the redundant title when it matches the uppercase eyebrow. The four model-default sections (new session, naming, forking, guided review) are merged under one "Session defaults" item as labelled sub-sections.

## 0.40.2

### Patch Changes

- 536817a: Add Settings → Shortcuts so users can customize the Command Center keyboard shortcut. `Cmd+K` / `Ctrl+K` remains the default, bindings persist in app settings, and conflicting terminal or dock shortcuts are rejected with inline feedback.

## 0.40.1

### Patch Changes

- d9ddb72: Replace native dropdown wrappers with the shared shadcn Select component across Prompt Library, Skills, and Space flows.

## 0.40.0

### Minor Changes

- 7cb3685: Add MCP Servers visibility for Cursor CLI and Antigravity, including live Cursor agent status and Antigravity config discovery from Gemini and project `.agents` files.

## 0.39.2

### Patch Changes

- b21109e: Trim Prompt Library copy actions to section-level path and prompt text buttons, and add a shared NativeSelect control with consistent chevron spacing across dropdowns.

## 0.39.1

### Patch Changes

- 98ae96c: Add Cursor CLI ACP as a first-class provider with session streaming, approvals, model and mode metadata, native command catalog integration, settings and quota polish, and parity hardening.

## 0.39.0

### Minor Changes

- 08e9c3b: Add Antigravity CLI as a Google provider with Gemini model presets, native skill invocation, continuation support, settings guidance, and post-run tool timeline recovery from Antigravity conversation data, including a fallback for print turns where status-line telemetry does not expose the conversation id. Google/Antigravity selectors are marked Alpha while telemetry visibility remains limited. Antigravity interactive turns no longer have a hard 5-minute Convergence watchdog, and temporary settings injection now queues concurrent turns and recovers stale Convergence locks after crashes without overwriting user-edited settings.

## 0.38.5

### Patch Changes

- 1da3fb2: Add review target source filters and search for sessions, workspaces, and pull requests.

## 0.38.4

### Patch Changes

- 11a7b77: Show the originating project name inline on idle terminal rows in the sidebar, next to the terminal name in a smaller muted font, so terminals are distinguishable at a glance without hovering.

## 0.38.3

### Patch Changes

- 764a70b: Add keyboard-first composer injection pickers for context, skills, and prompts.

## 0.38.2

### Patch Changes

- 9126454: Add configurable guided review model defaults with Opus and GPT-5.5 defaults and show a loading state while review guides generate.

## 0.38.1

### Patch Changes

- de356e8: Add code review actions for checking out remote pull requests into local worktrees and starting follow-up sessions from the review surface.

## 0.38.0

### Minor Changes

- 230af33: Add guided code review mode with AI-generated walkthrough sections, risk rationale tooltips, and remote GitHub pull request targets.

## 0.37.48

### Patch Changes

- c1b9897: Show image attachments as inline previews in sent messages while preserving click-to-open full previews.

## 0.37.47

### Patch Changes

- cab2c20: Fix session name regeneration so naming requests preserve the session's provider permission settings and no longer fail when the provider one-shot errors.

## 0.37.46

### Patch Changes

- 2fa367e: remove not needed docs anymore

## 0.37.45

### Patch Changes

- 4190494: Fix the Code surface switch so returning from Chat to Code without an active Code session opens the Code home route.

## 0.37.44

### Patch Changes

- 9b53e5a: Complete the code review performance cache identity so refreshed summaries and file patches are keyed by comparison point and working tree version while preserving the previous visible diff during replacement loads.
- 282b7dc: Harden Main View routing with shared navigation fallbacks for invalid sessions, stale Code Review targets, missing Spaces, and removed workspace state.

## 0.37.43

### Patch Changes

- fc3ca2b: Copy configured project env files into managed worktrees when they are created,
  and add a manual workspace action to sync env files into existing worktrees.

## 0.37.42

### Patch Changes

- 555a73b: Restore the visible status and project context line on sidebar Needs Review items.

## 0.37.41

### Patch Changes

- 2ec3164: Tighten backend service boundaries by routing session app operations through a dedicated application service, isolating session row persistence behind a repository, and moving deterministic service helpers into focused pure modules with tests.

## 0.37.40

### Patch Changes

- 2cd6519: Extract analytics service parsing and row-shaping helpers into pure analytics utilities with focused test coverage.
- b23c632: Refactor feedback submission internals so pure validation and error-detail parsing live behind focused pure helpers.

## 0.37.39

### Patch Changes

- e95692d: Refactor analytics profile snapshot parsing into pure helpers so the service boundary stays focused on database orchestration.
- ffea736: Refactor the attachment service boundary by moving deterministic helper logic into pure modules with focused coverage.
- 0967364: Refactor code review target ranking and pull request label formatting into a pure service boundary.
- e170c5e: Refactor feedback service helper boundaries.
- b676983: Refactor Claude MCP service parsing helpers into pure module boundaries.

## 0.37.38

### Patch Changes

- 0dd1671: Refactor Codex MCP service parsing and summary helpers into pure module boundaries.

## 0.37.37

### Patch Changes

- 364e251: Notify users when terminal tabs return to idle after running foreground work.

## 0.37.36

### Patch Changes

- 6e8c75f: Tighten provider thinking patch updates so only mutable thinking fields can be patched after creation.

## 0.37.35

### Patch Changes

- 115ee99: Surface regenerate-name progress and failures, and keep task progress wired to the session naming request.

## 0.37.34

### Patch Changes

- 87068fa: Respect explicit session badge sizing inside buttons so sidebar status icons render at the intended compact size.

## 0.37.33

### Patch Changes

- 125cec3: Condense sidebar attention rows and show their details in faster hover tooltips.

## 0.37.32

### Patch Changes

- 6706b1a: Add favorite models to the model picker so frequently used models can be starred, filtered, and kept at the top of picker results.

## 0.37.31

### Patch Changes

- e035aca: Allow the Code Review target and notes rails to collapse, with a diff focus mode
  that reclaims space for reviewing code on smaller screens.

## 0.37.30

### Patch Changes

- 97ac899: Batch session attention request kind lookups when listing sessions to avoid per-session database queries.

## 0.37.29

### Patch Changes

- 832eb48: Run project actions from the active session or draft workspace directory when the action has no explicit cwd override.

## 0.37.28

### Patch Changes

- 94cedf0: Add composer permission modes for ask/yolo/custom provider execution, with Codex and Claude Code advanced controls, and compact low-frequency composer resources behind the Add menu.

## 0.37.27

### Patch Changes

- 315145c: Show the active project or Space name in new composer titles instead of the app name.

## 0.37.26

### Patch Changes

- 03496f9: feat: add global model usage tracking to analytics insights

  Track AI model usage globally across all providers in the
  analytics > insights > usage panel. Adds a new model usage
  breakdown chart that aggregates sessions, turns, and message
  counts by model, plus a model label per provider in the
  existing provider usage bars.

  Key additions:
  - `ModelUsagePoint` type and `modelUsage` array in
    `AnalyticsOverview` type and entity/API types
  - `buildModelUsage()` aggregation function in `analytics.pure.ts`
  - Model column included in `listSessions()` SQL query
  - Model usage panel rendered in `usage-tab.presentational.tsx`
  - All test fixtures updated with `modelUsage: []` placeholders
    and assertions

## 0.37.25

### Patch Changes

- 0b45e02: Collapse the project actions menu into a single view. Clicking the actions trigger now opens the manage list directly, with inline expandable run output and an always-visible "Add action" row. The separate bottom log drawer has been removed.

## 0.37.24

### Patch Changes

- af6b799: Fix project action dropdown clicks and keep action management inside the top-bar menu.

## 0.37.23

### Patch Changes

- fe474b8: Fix duplicate provider thinking transcript items when streaming reasoning is followed by final thinking metadata.

## 0.37.22

### Patch Changes

- 46147c8: Add managed local model SSH tunnel profiles with a status-bar pill, quick controls, and an editable tunnel manager.
- 4c8af85: Add project actions in the session header with icon-backed action definitions, background execution, live output drawers, and compact session details.

## 0.37.21

### Patch Changes

- f363d91: Add a project Open menu that detects installed macOS editors and opens the active workspace or project root in Cursor, VS Code, Zed, WebStorm, or Finder.
- 2aa9eaa: Show provider reasoning and thinking deltas in the session transcript when supported by the active model.

## 0.37.20

### Patch Changes

- 3dc1f32: Move the session context-window indicator from conversation headers into the composer as a compact hoverable status dot.

## 0.37.19

### Patch Changes

- a89c55d: Fix provider update detection so Pi, Codex, and Claude Code can compare the installed CLI version against the latest npm version when version output is emitted on stderr or mixed with other CLI output.

## 0.37.18

### Patch Changes

- 32e8abc: Respect Pi model image support metadata, add safe outbound image diagnostics, and include local attachment paths so Pi can inspect files through its read tool when native image transport is unreliable.

## 0.37.17

### Patch Changes

- 7351bee: Show Codex usage limits in Settings and add a composer quota pill for Codex-backed model selections.

## 0.37.16

### Patch Changes

- 8b574ec: Fix starting a conversation session while a terminal-primary session is open so the main view switches to the conversation composer immediately.

## 0.37.15

### Patch Changes

- 0d01a42: Keep project session draft and status-bar project navigation aligned with routed main views so creating a new root conversation or switching projects from the status bar no longer snaps back to the previous session.

## 0.37.14

### Patch Changes

- 512d631: Harden structured interaction request labels, notifications, and docs.
- 13f22de: Add structured provider interaction requests so Codex choice questions can be answered directly from the conversation transcript.
- 0471809: Harden provider interaction request answers for mixed Codex prompts, unsupported MCP form schemas, and declining required forms.
- 45e7d49: Handle Pi extension UI dialog requests in the session transcript.
- a9da86d: Add Claude Code ExitPlanMode handling so deferred plans can be approved or rejected from the transcript.
- 49682a9: Add structured Codex MCP elicitation handling for form and URL requests.
- 45713b4: Add Claude Code AskUserQuestion handling so deferred choice prompts can be answered from the Convergence transcript.

## 0.37.13

### Patch Changes

- a38948a: Introduce route-driven Main Views for Code Sessions, Chat Sessions, Spaces, and Code Review.
- 4611319: Keep routed Code and Chat surface switching synchronized with active session routes and avoid duplicate Code Review route/store updates.

## 0.37.12

### Patch Changes

- ba7197b: lefthook pre-commit hook management

## 0.37.11

### Patch Changes

- 44fc4cf: feat: add cmd+Enter shortcut to all form submissions

## 0.37.10

### Patch Changes

- c9f6973: Add a first-class Code Review workspace for reviewing changed files, local review notes, agent handoff, and cached diff loading.

## 0.37.9

### Patch Changes

- 60c403e: Throttle streaming transcript persistence to reduce SQLite and IPC churn while multiple agent sessions are active.
- 7ea81c2: Add weekday headers to heatmap and streak calendar for better day identification

## 0.37.8

### Patch Changes

- 875c4e7: Allow the archived sidebar sections to be collapsed after they auto-open for an archived workspace, session, or Space.
- e3c36a0: Switch Command Center to the matching chat or code surface when opening projects, workspaces, and sessions.
- cc5e0fb: Update Pi Agent provider version checks and automatic updates to use the new `@earendil-works/pi-coding-agent` npm package, while migrating legacy global installs from the deprecated `@mariozechner/pi-coding-agent` package.

## 0.37.7

### Patch Changes

- 3ed49cd: Add in-app provider update actions and provider update notifications.

## 0.37.6

### Patch Changes

- c6e3283: fix: keep approval buttons visible while a tool/approval is pending

  Approval buttons used to disappear when Codex streamed an assistant
  delta (or other non-note item) after raising the approval, leaving the
  session stuck waiting. Approval actionability is now derived from
  `session.attention` plus the local resolved-id set, not from the
  ordering of conversation items.

## 0.37.5

### Patch Changes

- 6282022: Condense the sidebar footer into a tools menu and add a collapsed rail with an explicit peek handle.

## 0.37.4

### Patch Changes

- 0104332: Keep long approval and input prompts wrapped inside the transcript frame.

## 0.37.3

### Patch Changes

- d3c0b1f: Add a managed prompt library for project and global prompt files. Users can create, edit, delete, search, preview, and copy saved prompts before pasting them into the composer manually.

## 0.37.2

### Patch Changes

- d485dab: Fix simultaneous Codex approval cards so each pending approval shows actions on its own card and responds to the matching backend request.

## 0.37.1

### Patch Changes

- 3f03115: Polish Chat Spaces follow-up flows by adding a proper Space creation dialog, Space archive/delete actions, and a full-page new-chat composer with selectable Space context.

## 0.37.0

### Minor Changes

- 6b31686: Add Chat Spaces as a first-class grouping and context layer for global chat sessions. Spaces now support linked attempts, sources, editable brief and memory, explicit context previews for new attempts, and promoted artifacts with file-backed storage.

## 0.36.8

### Patch Changes

- 6dc3cec: Replace narrow model dropdowns with a two-panel command palette picker that supports provider filtering and full model IDs.

## 0.36.7

### Patch Changes

- ecec855: Add experimental agent UI response artifacts. Assistant Markdown can now include
  a `convergence-ui-html` artifact block that is rendered in a sandboxed
  right-side panel while the normal Markdown answer remains visible in the
  transcript. Artifact-bearing turns can be reselected, and empty or malformed UI
  HTML shows a safe placeholder instead of rendering an iframe.

## 0.36.6

### Patch Changes

- beaf7a8: Keep the Settings dialog at the larger Insights size for every settings section so switching sections no longer changes the modal dimensions.

## 0.36.5

### Patch Changes

- e75d845: Show Pi MCP servers from pi-mcp-adapter config files in the MCP Servers dialog, including OAuth authorization markers and setup guidance.

## 0.36.4

### Patch Changes

- 826c45c: Clarify that saved OpenRouter API keys are hidden after being stored in Keychain and that the credential field replaces an existing saved key.

## 0.36.3

### Patch Changes

- aa0c8ae: Add OpenRouter credential settings so users can paste an API key in Convergence, store it in macOS Keychain, and have Pi/OpenRouter sessions receive it automatically through `OPENROUTER_API_KEY`.

## 0.36.2

### Patch Changes

- 1583ea8: Add Pi model visibility settings so models from `~/.pi/agent/models.json` stay visible while users can opt into additional Pi models from app settings.

## 0.36.1

### Patch Changes

- 9d024b5: Integrate Pierre file tree and diff primitives into review changed-file flows.

## 0.36.0

### Minor Changes

- 16c9516: Add Mermaid diagram and syntax-highlighted code support in chat by migrating the markdown renderer from `react-markdown` to Vercel's [Streamdown](https://streamdown.ai).

  LLMs frequently emit ```mermaid fenced blocks (flowcharts, sequence diagrams, class diagrams); these now render as interactive SVG with zoom, copy, download, and fullscreen controls, and respect the app's light/dark theme. Fenced code blocks gain Shiki syntax highlighting (`github-light`/`github-dark`) plus copy/download buttons. Streamdown's `parseIncompleteMarkdown` also handles mid-stream incomplete markdown more cleanly than the previous renderer.

  Note: fenced code blocks switch from the previous custom card chrome (small-caps language label) to Streamdown's default chrome. Inline code keeps the existing pill style.

  Public `Markdown` component API is preserved. Removed `react-markdown` and `remark-gfm` dependencies; added `streamdown`, `@streamdown/mermaid`, `@streamdown/code`. Mermaid runs with `securityLevel: 'strict'` so LLM-supplied diagram code cannot execute inline JS.

## 0.35.0

### Minor Changes

- c9d03ec: Add the first global Chat Surface for project-free agent conversations.

  This introduces explicit project/global session context, global session persistence and APIs, a reusable conversation surface, a sidebar Chat switch, and a global chat session list. The Chat Surface can be opened without an active project and starts sessions through the shared composer without project, workspace, branch, pull request, changed-files, or terminal controls.

## 0.34.0

### Minor Changes

- 43c43a1: Add interactive local code review notes for changed files. Reviewers can now
  select diff lines, save draft questions, create file-level notes, filter notes
  by lifecycle state, preview the generated review packet, and send the collected
  context into the active agent session.

## 0.33.2

### Patch Changes

- 1ece782: Reset the Command Center results viewport when the search query changes so newly ranked results start at the top instead of preserving an old scroll position.

## 0.33.1

### Patch Changes

- b4dfaaf: Make command palette search match multi-word queries across separate fields, so terminal sessions can be found with project and surface terms like "backpack terminal" or "shell backpack".

## 0.33.0

### Minor Changes

- 8735565: Add a local pull request review flow. The command center can now open a
  review dialog, resolve GitHub pull request URLs to the matching configured
  project, prepare or refresh a dedicated `convergence/pr-<number>` worktree,
  cache pull request metadata, and start an agent session with a code-review
  prompt.

### Patch Changes

- 4a60e83: Add a Base Branch mode to the Changed Files panel so reviewers can switch
  between working-tree changes, PR-style base-branch changes, and turn history.

## 0.32.3

### Patch Changes

- 67c5501: Fix: creating a worktree via the New Workspace dialog now auto-targets
  that worktree for the next session. The empty session screen also shows
  a chip indicating which worktree (or the main repo) the next session
  will start in, with a one-click toggle back to the main repo.

  Previously the dialog closed silently and the next session ran against
  the root repo, causing users to repeat the action and accumulate orphan
  worktrees.

## 0.32.2

### Patch Changes

- 72f06b0: Fix the Skills dialog so the right details pane scrolls all the way to
  the bottom on large screens. The middle grid had no row track, so the
  inner `overflow-y-auto` had no resolved height and the SKILL.md card got
  clipped behind the footer.

## 0.32.1

### Patch Changes

- 25b23ad: Document the refined Convergence domain language for attention, initiative outputs, attempts, session forks, and workspace lifecycle.

## 0.32.0

### Minor Changes

- d1db9a6: feat(terminal): per-session dock placement (bottom/left/right)

  The secondary terminal dock can now sit on the left or right of the
  conversation in addition to the bottom. Press `Cmd+Shift+T`
  (`Ctrl+Shift+T` on non-mac) to cycle bottom → right → left → bottom.
  Placement, height, and width are remembered per session, so one session
  can keep the terminal at the bottom while another runs it as a side
  panel. The dock resize handle automatically switches between vertical
  and horizontal drag depending on placement, and double-click still
  resets to the default size on the active axis. Terminal-primary
  sessions are unaffected — their conversation placeholder stays at the
  bottom.

## 0.31.11

### Patch Changes

- 4a5f951: fix(usage-insights): readable axes on activity charts

  The Daily activity and Conversation balance charts now render a real time x-axis
  with date ticks (Apr 4, Apr 11, …) instead of a numeric index axis that produced
  fractional labels like `7.25` or `21.5`. The Provider usage chart, which used a
  categorical x-axis that the underlying chart engine could not label, has been
  replaced with an HTML grouped-bar visualization that lists each provider with
  sessions and turns side by side.

## 0.31.10

### Patch Changes

- 684e162: Show total conversation duration in the session header. The chip displays the sum of every turn's elapsed span (clock icon + formatted duration), giving a quick sense of how long a conversation has taken alongside the existing per-turn timestamps.

## 0.31.9

### Patch Changes

- adc33af: Add PR-aware workspace lifecycle controls. Workspaces now show cached pull request status, can be archived without deleting conversation history, can be unarchived, and can remove their git worktree from disk behind an explicit confirmation while keeping historical sessions available.

## 0.31.8

### Patch Changes

- 594a78b: Auto-expand the parent worktree group in the sidebar when clicking a session from the "Needs Review" or "Waiting on You" lists. The sidebar previously opened the conversation but left the worktree collapsed, hiding where the session lived in the project tree.

## 0.31.7

### Patch Changes

- baf2af6: Fix transcript scroll fighting the user. The virtualized transcript no longer re-anchors to the bottom on every render of the last row, so scrolling up stays where you left it. Auto-follow still re-engages while you're near the bottom (including streaming size growth) and resets on session switch.

## 0.31.6

### Patch Changes

- cfbaa17: Clarify that provider CLIs use the detected shell Node/npm prefix, while Convergence itself runs on Electron's embedded Node runtime.

## 0.31.5

### Patch Changes

- d4ee76f: Add provider self-updates from the Providers dialog. Convergence now detects npm-managed Claude Code, Codex, and Pi Agent installs, shows their npm prefix and runtime Node version, and can refresh an outdated provider in place using the npm binary from the detected install.

## 0.31.4

### Patch Changes

- 0491e3a: Virtualize the active session transcript with TanStack Virtual, preserve turn dividers and approval actions, and keep the transcript pinned only while the user is already near the bottom.

## 0.31.3

### Patch Changes

- bacf03f: Fix Codex MCP approvals so elicitation requests appear as actionable approval cards in Convergence instead of leaving sessions stuck while Codex waits for a response.

## 0.31.2

### Patch Changes

- 6c01676: Fix Codex provider update command in the Providers panel. The previous `codex --upgrade` flag does not exist in the Codex CLI; replaced it with `npm install -g @openai/codex@latest`, matching the install command and reliably upgrading any npm-managed installation.

## 0.31.1

### Patch Changes

- 807d449: Recover stale approval requests when the provider session is no longer active
  instead of surfacing a remote-method error.

## 0.31.0

### Minor Changes

- bb63502: Add provider debug visibility. Long-running Codex/Pi/Claude sessions now emit a transcript note after 60 seconds of silence from the provider subprocess and a warning after 3 minutes, so it's clear whether a turn is reasoning or genuinely stuck. Codex `item/started` notifications with `reasoning`/`agentReasoning` item types map to the `thinking` activity. A new "Capture provider debug logs" setting writes every captured event (notifications, server requests, stdout/stderr chunks, lifecycle) to a per-session JSONL file under the app data directory; files rotate at 10 MB and are cleaned up after 30 days. When the toggle is on, the session view exposes a Provider debug log drawer with copy-to-clipboard and "Open log folder" actions. Production builds default to the toggle being off; dev builds additionally tee everything to stderr.

## 0.30.1

### Patch Changes

- de23ea1: Fix Cmd+K command palette selection landing mid-list. cmdk preserved the previously selected value across re-renders, so when the curated view switched to the ranked view on typing, the highlight stayed on the old item instead of jumping to the top result. Now the selected value is controlled and reset to the first visible item whenever the view changes.

## 0.30.0

### Minor Changes

- 4628d1c: Add local-only analytics Insights for reviewing personal Convergence usage, including session and message totals, ChartGPU-backed activity charts, streak tracking, provider/project breakdowns, and opt-in generated Work Style summaries.

## 0.29.4

### Patch Changes

- ad21133: Make selection and hover highlights visible in light mode by retuning `--accent` from `oklch(0.955 0 0)` (a near-white that gave only ~0.03 lightness delta against the popover surface) to a warm pale yellow `oklch(0.915 0.075 95)` with a matching darker `--accent-foreground`. The Command palette selected row, searchable-select highlight, dropdown focus state, button ghost/outline hover, sidebar active session, and selected file rows are now clearly distinguishable on the light theme. Dark mode is unchanged.

## 0.29.3

### Patch Changes

- 361472d: Reduce static-analysis noise by keeping module-local helpers private.

## 0.29.2

### Patch Changes

- a8d8e11: Configure Fallow for Electron entry points and prune unused static-analysis surface area.

## 0.29.1

### Patch Changes

- 58067ef: Fix unreadable warning chips in light mode by introducing semantic `--warning` and `--warning-foreground` design tokens. The Skills dialog (and 16 other call sites) previously used `text-amber-100` / `text-amber-200` without a light-mode variant, which rendered as near-invisible pale text on light backgrounds. All amber warning utilities are now expressed as `bg-warning/X`, `border-warning/X`, `text-warning`, and `text-warning-foreground`, so retuning the warning hue is a one-line change in `src/app/global.css`.

## 0.29.0

### Minor Changes

- 9a2bd21: Project-level context items can now be injected into agent sessions. Define reusable text blocks per project under Project Settings → Context (label, body, boot vs. every-turn re-inject mode), attach them at session create with a chip strip, and the active session shows an "Every-turn context active" badge above the composer when items are flagged for re-injection.

  Three injection paths land in v1, all provider-neutral (Claude Code, Codex, PI):
  - **Boot**: attached items are wrapped as `<{project-slug}:context>...</{project-slug}:context>`, emitted as a sequence-1 `note` ConversationItem, and prepended to the user's first message before the provider sees it.
  - **Every-turn**: items flagged `every-turn` are read fresh per send and prepended to every user-initiated message — typed turns, queued follow-ups, and input-request answers — so an edit between turns is reflected on the next send. Approval responses, tool results, and assistant continuations are explicitly excluded.
  - **Mention**: type `::name` in the composer to open a filtered picker that inlines the chosen item's body verbatim. Nothing is persisted as a token; the expanded text is what the provider sees and what the transcript stores.

  Past sends are immutable: editing or deleting a project context item never rewrites prior transcript entries. Schema additions: `project_context_items` and `session_context_attachments` (both with `ON DELETE CASCADE`).

## 0.28.6

### Patch Changes

- de97d10: Deepen transcript entry rendering around a pure view model so copy text, timing, attachment resolution, and action state are derived from normalized conversation items before rendering.

## 0.28.5

### Patch Changes

- b35838a: Revert the stuck approval recovery change from 0.28.3. Approval actions once again remain tied to the latest transcript item, and Codex exits no longer force an active session into a failed state based on local provider bookkeeping.

## 0.28.4

### Patch Changes

- 716f08f: Discover skills exposed as symlinked directories under `~/.claude/skills/` and project skill roots. The filesystem skill scanner previously dropped symlinks because `Dirent.isDirectory()` reports `false` for them, so externally managed skill collections (e.g. Matt Pocock's installer) never appeared in the composer skill picker.

## 0.28.3

### Patch Changes

- 917d7b5: Fix stuck approval recovery in session conversations. Approval cards remain actionable even if later transcript items arrive after the request, and Codex sessions now fail cleanly with an error note if the provider exits before the active turn completes.

## 0.28.2

### Patch Changes

- b5b24c5: Preserve image attachment aspect ratios in composer thumbnails and full preview modals so tall or wide images are scaled to fit without being cropped.

## 0.28.1

### Patch Changes

- de54e0d: Claude Code skills picker now lists plugin skills installed via `/plugin install`. Discovery reads `~/.claude/plugins/installed_plugins.json` for authoritative install paths and falls back to a depth-bounded walk of `~/.claude/plugins/cache/` when no manifest is present, so plugins like `agent-skills`, `caveman`, and `frontend-design` surface in the picker just like in the real Claude Code harness.

## 0.28.0

### Minor Changes

- 6380ccf: Pi provider now implements the `oneShot` interface used by Claude Code and Codex providers. This unlocks summary-driven flows (session fork, session naming, initiative synthesis) for pi sessions. The implementation spawns the pi binary in `--mode rpc`, sends a `prompt` request, accumulates `text_delta` chunks, and resolves on `agent_end`. Task progress events are emitted when a `TaskProgressService` is wired in.

## 0.27.6

### Patch Changes

- 307bc11: Recover stale running sessions after app restart instead of leaving them stuck
  as running with queued follow-ups that cannot be stopped.

## 0.27.5

### Patch Changes

- 833e489: Show timestamps and elapsed turn timing on conversation transcript items.

## 0.27.4

### Patch Changes

- 0276624: Show provider harness update status in the Providers dialog. Convergence now checks the npm registry for the latest Claude Code, Codex, and Pi Agent harness versions, labels each installed provider as latest, outdated, or unknown, and displays the relevant install or update command when action is needed.

## 0.27.3

### Patch Changes

- a775512: Fix feedback submission so feature requests actually reach Convergence Cloud. The cloud enforces a flat `metadata` record of primitive values, so the desktop app now flattens session context into `context.<key>` entries and omits unset optional fields instead of sending `null`. Failed submissions also surface the cloud's error body in the dialog instead of a bare HTTP status.

## 0.27.2

### Patch Changes

- c1aad9d: Use the scoped `FEEDBACK_TOKEN` env var when submitting feature requests to Convergence Cloud. The previous `INTERNAL_API_TOKEN` granted access to every protected cloud route; the new token is limited to `/api/feedback/*` so a leaked desktop build can only hit the feedback intake. The release workflow now writes `.env` from a GitHub Actions secret before packaging so signed Mac builds ship with the token bundled.

## 0.27.1

### Patch Changes

- 5f39295: Show steer and follow-up messages in the conversation transcript with a small badge, so users can see the input they sent while the agent was running. Codex steer and Pi running input now emit the user message locally instead of relying on the provider to echo it back.

## 0.27.0

### Minor Changes

- 869cb31: Submit feature request feedback to Convergence Cloud from the in-app feedback form.

## 0.26.1

### Patch Changes

- 1797f65: Fix old conversation views crashing when historical attachment metadata has not hydrated yet.

## 0.26.0

### Minor Changes

- 3bdcb4f: Allow supported agent sessions to accept follow-up or steering input while they are running, with persisted queued follow-ups and provider-specific Codex/Pi handling.

## 0.25.0

### Minor Changes

- 9a60bad: Show attachments inside conversation history.

  Two issues fixed:
  - Provider adapters (Claude Code, Codex, Pi) were dropping `attachmentIds` when emitting the persisted user message. The model still received the bytes, but the stored `ConversationItem` had no record of which attachments were sent. This regressed during the conversation-normalization migration; the emitter signature already supported the field.
  - The transcript view never rendered attachment chips on stored user messages, even before the regression — the original session-attachments spec only covered the composer surface.

  Now: attachments persist on the user message, the session view hydrates attachment metadata once per mount, and chips render inline below the user text. Clicking a chip opens the same preview modal used by the composer. Attachments whose underlying file is no longer available render as a broken-icon "Unavailable" chip.

## 0.24.0

### Minor Changes

- e662c41: Add first-class skills support across Codex, Claude Code, and Pi. Users can browse provider skill catalogs, inspect full `SKILL.md` details, select skills from the composer, invoke them through provider-native paths, and see Claude Code skill activation confirmed from native telemetry when available.

## 0.23.5

### Patch Changes

- 135050a: Tighten renderer architecture enforcement with API wrappers and Chaperone rules for preload access and FSD public imports.

## 0.23.4

### Patch Changes

- 4152b8b: Document the Prettier formatting rule in `CLAUDE.md` and `AGENTS.md`. Agents must accept reformatting from `chaperone check --fix` (including diffs to files outside their immediate scope), commit those changes — separately as `chore: prettier` if they're unrelated to the current task — rather than skip them or assume they're someone else's WIP.

## 0.23.3

### Patch Changes

- 38240fa: Fix command palette and searchable select highlighting in light mode. The selected row used `bg-white/10`, which was invisible against the near-white popover background. Switched to theme tokens (`bg-accent` / `text-accent-foreground`) so the highlight has proper contrast in both light and dark modes.

## 0.23.2

### Patch Changes

- fcee2ce: Improve light mode contrast for status badges and indicators. Initiative status/attention pills, provider availability badges, MCP server status badges (including the yellow "needs authentication" pill), the global status bar, and the AttentionIndicator now use darker text colors in light mode while preserving the existing dark mode appearance.

## 0.23.1

### Patch Changes

- 081f84b: Fix text overflow in Project Settings workspace start point buttons. Description text now wraps inside the button instead of being clipped at the button edge.

## 0.23.0

### Minor Changes

- d4769bf: Add agent-native Initiatives V1 for tracking delivery work across sessions and
  projects. Initiatives now provide a global workboard, session Attempt linking,
  linked-session context panels, durable current understanding, manual and
  suggested outputs, provider-backed synthesis suggestions, and manually editable
  attention flags.

## 0.22.3

### Patch Changes

- b056774: Status bar tooltips now open almost instantly (120ms) instead of waiting on the global 1500ms tooltip delay, so hovering over running/attention/project chips surfaces details right away.

## 0.22.2

### Patch Changes

- a0fbf98: Fix MCP server discovery for Claude Code when built-in `claude.ai ...` servers
  appear in `claude mcp list` but fail individual `claude mcp get` lookups.
  Convergence now falls back to list-based parsing instead of dropping the whole
  provider section, and the MCP dialog also shows Pi with a note explaining that
  its CLI does not expose inspectable MCP server discovery yet.

## 0.22.1

### Patch Changes

- 8fd0be3: Rename the sidebar project action from "Create Project" / "New Project" to
  "Open a project" for consistency. The button has always opened an existing
  directory via the native picker, so the wording now matches the behavior.

## 0.22.0

### Minor Changes

- 3cf3415: feat(terminal): promote terminal to a first-class session surface. Sessions now carry a `primarySurface` field that chooses between the conversation transcript and the terminal pane tree in the main pane, with the opposite surface as an opt-in bottom dock. A new synthetic `shell` provider lets users create terminal-only sessions (no agent attached) via an intent dialog (Conversation / Terminal) on `+ New session` and a new `new-terminal-session` command in Cmd+K. Pane layout (tree shape, split sizes, tab CWDs and titles) is persisted per session and replayed as fresh PTYs in the saved working directories on app restart — scrollback and live processes are not preserved (future tmux work). Shell-provider sessions skip auto-naming, hide the fork action, and display "Terminal" in the provider chip. `Cmd+J` toggles the conversation dock when terminal is the primary surface. Existing conversation sessions behave identically; the layout change is gated on the new primary surface field so no migration is required for current users.

## 0.21.1

### Patch Changes

- 6b1d745: Fix structured-summary session forks so additional instructions stay visible in the preview and are applied to the final seed when the fork is created.

## 0.21.0

### Minor Changes

- 78ff1a3: feat(activity): surface native provider auto-compaction as a `compacting` activity state in the session header and status bar. Pi maps `compaction_start`/`compaction_end`, Codex maps `contextCompaction` item lifecycle events, and Claude Code maps best-effort stream-json hook/compaction shapes, so users can see when the underlying CLI is auto-compacting instead of guessing during slower turns.

### Patch Changes

- 446254c: chore(markdown): add runtime canary that warns in the console when a rendered assistant message appears to be missing its tail versus the source string. Catches silent truncation bugs from the markdown parser, the conversation-item persistence pipeline, or streaming flush edge cases without needing DevTools inspection.

## 0.20.0

### Minor Changes

- da183b7: Pick the base branch when creating a workspace. The new workspace dialog now shows a searchable "Create from" list of local and origin branches, so a new worktree can branch off any ref on demand instead of always using the project-wide setting. Leaving the selection on "Project default" preserves existing behavior.

## 0.19.0

### Minor Changes

- 673bb96: Group the extended Changed Files panel by agent turn. Each round-trip
  from user message to agent-idle is now recorded as a turn with its own
  per-turn diffs, so reviewers can see what the agent did in each step
  rather than a single cumulative working-tree diff. The compact view is
  unchanged and continues to show the live git-status list. Existing
  sessions show an empty turn list in the extended view — only sessions
  started after this release accumulate turn records.

## 0.18.5

### Patch Changes

- 59af8da: Add a bottom-right feedback button with a dialog for collecting Convergence app feedback. Submissions currently go through a mocked Electron API boundary so the real destination can be wired later.

  Keep the release history pagination visible in the What's New dialog footer so users can move between release pages without scrolling to the bottom of the notes.

## 0.18.4

### Patch Changes

- 44a7f24: Fix Pi provider label in composer dropdown: show "Pi" as the primary label instead of the creator name.

## 0.18.3

### Patch Changes

- a7e5abd: Paginate the Release History list in the About Convergence dialog (5 per page) so the modal stays compact as the changelog grows.

## 0.18.2

### Patch Changes

- 58c9092: Fix agent completion notifications so real session finish and attention
  transitions trigger the same toast, sound, and system notification flow as
  the manual notification test action.

## 0.18.1

### Patch Changes

- 307cd8e: Prevent packaged macOS builds from crashing on launch when the
  `electron-updater` module loads with an unexpected export shape.
  Convergence now disables auto-updates for that build instead of aborting
  startup, so affected users can still open the app and install a follow-up
  release.

## 0.18.0

### Minor Changes

- 6ad9c88: Ship automatic updates for packaged macOS builds. Convergence now checks
  GitHub Releases for new versions on startup (after a 10s delay) and
  every four hours thereafter, then surfaces any available update through
  an actionable toast, a new section in Settings, and a `Check for
updates…` entry in the Command Center.

  The flow never installs silently: users are asked before downloading
  and again before installing. Background checking is opt-out via
  Settings → Updates → "Check for updates automatically".

  Release artifacts now ship both Intel (`x64`) and Apple Silicon
  (`arm64`) variants; electron-updater picks the matching arch at
  runtime from the published `latest-mac.yml`.

  Dev mode (`npm run dev`) disables every update code path — the Settings
  section and the Command Center item stay visible but are clearly marked
  as disabled.

  **One-time note:** users on v0.16.0 or earlier need to download and
  install this release manually (via the DMG on GitHub). Every release
  from this version onward will be picked up by the auto-updater.

## 0.17.1

### Patch Changes

- 9d17975: Fix the app settings dialog so long settings lists scroll correctly, use the
  shared dark scrollbar styling, and present settings in clearer grouped sections
  with better control alignment.

## 0.17.0

### Minor Changes

- b7fc109: Add a hover-to-copy button on every conversation item in the session view.
  Each message, agent response, thinking block, tool call, tool result,
  approval request, input request, and system note now reveals a small copy
  button in its top-right corner on hover or keyboard focus. Clicking copies
  the raw underlying text — original markdown for messages, the raw
  stringified input or output for tool calls — so you can grab a specific
  portion of the conversation without hand-selecting.

## 0.16.0

### Minor Changes

- 07df4e9: Add a full notifications system: toasts, sounds, inline pulses, dock badge
  and bounce, system-level macOS notifications, and a settings panel with a
  test-fire button. Notifications fire on agent attention transitions
  (`finished` / `needs input` / `needs approval` / `errored`), respect a
  suppression matrix tied to window focus and the active session, and
  collapse bursts via a 5-second per-severity coalescer with a 3-per-minute
  rate limit on system-level fires. A first-run onboarding card surfaces the
  new settings; everything is opt-out per channel and per event.

## 0.15.0

### Minor Changes

- 9997130: Normalize sessions around lightweight summaries and first-class conversation
  items instead of embedded transcript blobs. Providers now emit a canonical
  delta stream that the backend persists into `session_conversation_items`, and
  the renderer consumes split summary/detail session data rather than hydrating
  full conversations everywhere.

  This release also updates forking and session surfaces to work from normalized
  conversation items, migrates existing local transcript-backed sessions to the
  new model on startup, and rebuilds legacy databases to drop the old
  `sessions.transcript` storage once the normalized conversation rows are in
  place.

## 0.14.4

### Patch Changes

- 29c09a1: Fix long provider, model, and project pickers by replacing unbounded dropdowns
  with searchable popovers and aligning their scrollbars with the shared app
  scrollbar styling.

## 0.14.3

### Patch Changes

- 5db7ba0: Add agent task progress primitive and wire fork-preview + auto-naming
  to it. Long-running one-shot provider calls now stream `started`,
  `stdout-chunk`, `stderr-chunk`, and `settled` events over a dedicated
  IPC channel. The fork dialog's summary extraction shows a live elapsed
  counter, a "still working" hint past 45s, and a stale warning when the
  provider has produced no output for 30s beyond the extended threshold.
  Session auto-naming uses the same primitive, surfacing its progress
  to the dev-mode console subscriber without any visible UI yet.

## 0.14.2

### Patch Changes

- 02f5791: Fix structured-summary preview in the fork dialog. The session-fork
  service was detaching `provider.oneShot` into a local variable before
  invoking it, which lost the method's `this` binding and caused the
  Claude Code adapter to read `binaryPath` off `undefined`. The preview
  call now invokes `oneShot` directly on the provider, matching the
  pattern used by session auto-naming.

## 0.14.1

### Patch Changes

- 7a4f3e8: fixing threads

## 0.14.0

### Minor Changes

- 3d4df55: Add session fork with full-transcript and structured-summary strategies.
  - A new **Fork session…** action is available from a session's header kebab
    menu and from the Command Center (Cmd+K) when a session is focused. Each
    entry opens a fork dialog pre-populated from the parent session's name,
    provider, model, and effort.
  - **Full transcript** strategy seeds the child session by pasting the
    parent's conversation verbatim. **Structured summary** asks the parent's
    provider to extract decisions, key facts (with verbatim evidence),
    artifacts, open questions, and suggested next steps into a typed artifact
    rendered as an editable markdown seed. The summary strategy is disabled
    for parent sessions with very short transcripts.
  - The dialog also lets you pick a different provider/model/effort for the
    child and choose whether to reuse the parent's workspace or create a new
    worktree on its own branch.
  - Forked sessions display a **Forked from: &lt;parent&gt;** chip in their
    header that navigates back to the parent with a click. Session fork
    tracking is persisted in the sessions store alongside existing session
    metadata.

## 0.13.0

### Minor Changes

- ba57c96: Add a global Cmd+K command palette for cross-project navigation.
  - `Cmd+K` (macOS) / `Ctrl+K` (other platforms) opens a global palette from
    anywhere in the app. An empty query shows curated sections — **Waiting on
    You**, **Needs Review**, **Recent Sessions**, **Projects**, **Workspaces**,
    **Dialogs** — in that order. Typing ranks projects, workspaces, sessions,
    dialogs, and "New session in <branch>" / "New workspace in <project>"
    affordances via Fuse.js weighted over session name, project name, branch
    name, provider, and dialog title.
  - Selecting a session in another project performs a single cross-project hop
    (`switchToSession`) that preserves the existing sidebar **Waiting on You**
    click behaviour. Selecting a workspace activates its owning project;
    selecting a dialog routes through the shared `useDialogStore`.
  - **Behaviour change:** the terminal `Cmd+K` (clear) shortcut is now scoped
    to terminal-dock focus. When your focus is outside the dock, `Cmd+K` opens
    the palette; click into a terminal pane first to clear it. All other
    terminal shortcuts (`Cmd+T`, splits, focus-adjacent, toggle-dock) are
    unchanged and still fire from anywhere.

## 0.12.1

### Patch Changes

- 3f26025: Fix the composer scrollbar so it uses the shared themed scrollbar styling in
  both dark and light modes. The composer input now goes through a shared
  textarea primitive, which keeps future multiline inputs aligned with the app's
  common scrollbar treatment.

## 0.12.0

### Minor Changes

- fe4daa2: `Cmd-T` (Ctrl-T on other platforms) now doubles as an "open terminal" shortcut: when the dock is hidden it becomes visible, and when the active session has no pane tree yet it opens the first pane in the session's working directory. When the dock is already visible with an existing tree, the shortcut keeps its original `new-tab` behavior.

## 0.11.1

### Patch Changes

- d070e33: Fix terminal dock single-leaf width collapse: when the dock held a single pane, the leaf took intrinsic width inside the dock's flex-row container instead of filling it. Split layouts were unaffected because `Group` already stretched. Leaf root now carries `w-full min-w-0`, matching the `Group` path.

## 0.11.0

### Minor Changes

- 6c5ba58: Embedded terminal surface: PTY-backed dock with recursive splits, tabs, keyboard shortcuts (Cmd-T/D/W/K/`/arrows), close-confirm on running foreground process, and user-resizable dock height. Panes open in the active session's working directory; PTYs clean up on window/app close.

## 0.10.2

### Patch Changes

- c6fceae: Fix intermittent attachment failures caused by legacy attachment foreign keys.

  Draft attachments created before a session exists now recover from stale
  `attachments.session_id -> sessions.id` schemas by repairing the table and
  retrying the insert. The database migration also detects that legacy foreign
  key using SQLite metadata instead of brittle SQL text matching.

## 0.10.1

### Patch Changes

- 807b6f7: Fix two composer/sidebar defects.
  - Attachments: fix `FOREIGN KEY constraint failed` when attaching to a session that hasn't been created yet. Drafts ingest under the sentinel `__new__` session id, and the real session id is rebound (files moved + row updated) on the first `session.start`/`sendMessage`. The `attachments` table no longer FK-references `sessions(id)`; cleanup stays correct via the existing explicit `deleteForSession` path and a broader orphan sweep that also prunes DB rows whose session is gone. Existing databases are migrated in place.
  - Sidebar: the "Regenerate name" action now shows a spinner on the session row (and in the dropdown item) while the naming agent runs, so users can see that regeneration is in flight. The menu item is disabled while regenerating to prevent double-invocation.

## 0.10.0

### Minor Changes

- 2369f9a: Add session attachments support for images, PDFs, and UTF-8 text files. Users can attach files via a `+` button, clipboard paste, or drag-and-drop onto the composer; each provider receives attachments in its native format (Claude Code: base64 content blocks + PDFs; Codex: `localImage` entries; Pi: base64 `images[]`). Capability is surfaced per provider — PDFs are Claude-Code-only, and incompatible attachments render a red-outlined chip with a blocked send button. Attachments persist under `{userData}/attachments/{sessionId}/`, are orphan-swept on boot, and are cascaded on session delete.

## 0.9.2

### Patch Changes

- 31608f5: New workspaces now branch from the project's configured base branch by default instead of inheriting whatever commit the source repository currently has checked out. Convergence also adds a project setting that lets you switch workspace creation back to the previous current-HEAD strategy and optionally pin the base branch name explicitly.

## 0.9.1

### Patch Changes

- 8625781: Open external app links in the system browser instead of spawning a new Convergence window.

## 0.9.0

### Minor Changes

- 8e0a1f7: Add a global status bar across the bottom of the app that surfaces agent activity across every project.
  - Aggregate counters for running sessions and sessions that need the user, with a popover grouped by project.
  - Per-project chips for projects with active or attention-needing sessions, clickable to switch project.
  - Recency badge for the most recently completed or failed session.
  - New `activity` signal on sessions (`streaming`, `thinking`, `tool:<name>`, `waiting-approval`, or `null`) derived from provider events for Claude Code, Codex, and Pi, persisted on the session row and shown per-session in the project popover.

## 0.8.0

### Minor Changes

- 6e4d7bc: Automatically name sessions after the first assistant response using each provider's fast model, with inline rename and regenerate-name actions in the sidebar and a per-provider naming model picker in app settings.

## 0.7.0

### Minor Changes

- a89a84f: Add archive and unarchive session lifecycle support, split the attention surface into waiting-on-you and needs-review sections, and surface archived sessions separately from the active working set.

## 0.6.0

### Minor Changes

- fad2f4d: Add Pi Agent (by Mario Zechner) as a third first-class provider alongside Claude Code and Codex. Convergence detects the `pi` binary on PATH, registers a `PiProvider` that drives `pi --mode rpc` via its custom JSONL protocol, and maps pi's streaming events (message_update text/tool-call deltas, tool_execution_end, turn_end stats, agent_end stop reasons, compaction/auto-retry) onto the existing transcript model. Auth is delegated to the CLI — when `pi` is installed but `~/.pi/agent/auth.json` is empty or missing, the provider status dialog shows "Needs login" with guidance to run `pi /login` in a terminal. Effort levels map to pi's thinking ladder (off/minimal/low/medium/high/xhigh). The default model descriptor is a single "Pi default" entry; dynamic model enumeration is deferred to a follow-up.
- 42f8a87: Enumerate Pi Agent models dynamically from the installed `pi` binary. When the provider descriptor is requested, Convergence now spawns a short-lived `pi --mode rpc --no-session` subprocess, sends `get_available_models`, and maps every returned Model to a `ProviderModelOption` with id `"provider/modelId"` and label `"Vendor · Name"`. Models flagged `reasoning: true` receive the full effort ladder (`none → high`), plus `xhigh` for OpenAI-provider models; non-reasoning models receive no effort options. If the probe times out, the binary fails to spawn, or pi returns an empty list (no credentials configured), Convergence falls back to the static `Pi default` descriptor so the picker stays usable. Session spawn now passes `--model <provider/id>` and `--thinking <level>` when the user picks something other than the fallback.

## 0.5.0

### Minor Changes

- f7b1a46: Add global app settings for default provider, model, and reasoning effort. Opens from a cog icon in the sidebar topbar, persists through the backend `app_settings` key, broadcasts updates across renderer surfaces, and seeds session-start and composer with the stored defaults when starting new sessions.

## 0.4.1

### Patch Changes

- 646589e: Surface Codex turn-start failures and main-process startup failures to the user. Previously a rejected `turn/start` JSON-RPC call in the Codex provider was silently swallowed, leaving the session stuck in `running` with no feedback; it now emits a system transcript entry and transitions the session to `failed`. Unhandled rejections during Electron main-process init (database open, provider detection, IPC registration) would leave the app running with no window; they now show a native error dialog and quit cleanly.

## 0.4.0

### Minor Changes

- 5dc70cb: Show CLI version in the provider status dialog. Convergence now runs `--version` on detected provider binaries (Claude Code, Codex) and displays the result alongside the binary path.

## 0.3.1

### Patch Changes

- 6039e51: Add Claude Opus 4.7 to the hardcoded Claude Code provider model list, matching the latest model released by Anthropic (API ID: claude-opus-4-7).

## 0.3.0

### Minor Changes

- 1cfc295: Add proper macOS app icon assets generated from the Convergence logo and show Claude Code/Codex runtime availability in a new provider status dialog inside the app.

## 0.2.3

### Patch Changes

- ed9efd4: Fix packaged macOS app startup so provider detection and MCP discovery can find installed `claude` and `codex` binaries outside of `npm run dev`.

## 0.2.2

### Patch Changes

- 8b63b41: Fix macOS notarization workflow credentials by using the app-specific password secret explicitly during release publishing.

## 0.2.1

### Patch Changes

- edf6ae3: Enable signed and notarized macOS release builds in GitHub Actions while keeping separate unsigned local packaging commands for owner-only development builds.

## 0.2.0

### Minor Changes

- 6a9e26a: Add read-only MCP server visibility for active projects and provider-aware context window telemetry in sessions.
  - show available global and project MCP servers for Claude Code and Codex
  - add Codex exact context window telemetry in the session header
  - add Claude estimated context window fallback with clearer hover details
  - improve shared dialog and tooltip polish for the new surfaces

## 0.1.1

### Patch Changes

- ffa53c7: Automate release tag creation after version bumps land on `master`, and
  slightly reduce the session header title size for a cleaner main-area header.

## 0.1.0

### Minor Changes

- 38e2cec: Add the first release foundation for Convergence with Changesets, macOS packaging,
  GitHub Actions release workflows, and a bundled in-app "What's New" surface.

  Also polish core desktop ergonomics with tooltip-driven sidebar truncation fixes,
  better resize handles, and improved session/project scanning in the sidebar.
