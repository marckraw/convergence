# Turn Feedback Loop

**Status:** Phase B. Builds on `docs/specs/turn-grouped-file-changes.md`
and **depends on** `docs/specs/turn-inline-comments.md`. Do not ship
before inline comments.

## Goal

Close the review loop: let the developer turn inline review comments
into a structured follow-up message that the agent then acts on.
Without this, comments are diary entries — the reviewer writes "rename
this variable" next to line 42 and then has to retype that intent as a
new prompt.

With this, the reviewer clicks a single action and the agent receives
a structured summary of every comment, anchored to the relevant code.
The agent resumes the session and addresses the comments.

## Product intent

- After a turn ends, a floating "Send N comments to agent" action
  appears near the composer whenever the current session has at least
  one unaddressed comment.
- Clicking the action opens a preview dialog showing:
  - the composed follow-up message (read-only)
  - the list of comments included, grouped by file and turn
  - per-comment checkboxes to exclude specific comments from this send
  - an optional "additional instruction" textarea the user can prepend
    to the generated message
  - a "Send to agent" button and a "Cancel" button
- Sending calls `sendMessage()` on the session with the composed text.
  The agent receives it as a normal user turn.
- After a successful send, the included comments are marked
  `addressed_at = now`. The floating action disappears (no more
  unaddressed comments).
- Addressed comments still render in their place, but dimmed, with a
  subtle "addressed in Turn N" annotation.
- The developer can "re-open" an addressed comment (set
  `addressed_at = null`) if they want to include it again in a future
  send. Single menu action from the comment kebab.

## Non-goals

- No automatic sending — every send is explicit, user-initiated.
- No per-comment threading with the agent's response. The agent
  replies in a new turn and its response does not back-link to
  individual comments.
- No tracking of whether the agent actually addressed the issue.
  "Addressed" here means "sent to the agent," not "resolved."
- No templated AI-side prompting instructions ("always respond with
  X"). The composed message is a literal text block; prompt
  engineering is out of scope.
- No cross-session feedback. Comments sent belong to the current
  session only.
- No bulk "send all comments" across turns — V1 uses the natural scope
  of "all unaddressed comments in this session."

## V1 behavior

### Data model changes

Add two columns to `session_turn_file_comments` (defined in
`turn-inline-comments.md`):

```sql
ALTER TABLE session_turn_file_comments
  ADD COLUMN addressed_at TEXT;                     -- nullable timestamp
ALTER TABLE session_turn_file_comments
  ADD COLUMN addressed_in_turn_id TEXT;             -- nullable FK
```

No FK constraint on `addressed_in_turn_id` to keep writes simple — it
is a soft reference.

### Composed message format

Plaintext markdown, structured, agent-friendly:

```
I reviewed the changes in the last turn(s) and have feedback on these files:

## src/auth/login.ts

- Line 42 (in your modification): rename `tempToken` to `sessionTicket`
  — aligns with naming elsewhere.
- Line 87 (in your modification): the null-check here is redundant
  since `resolveUser()` now guarantees non-null.

## src/auth/login.types.ts

- Line 12: add a doc-comment explaining the `role` union.

[optional additional instruction from user, if provided]

Please address these. Do not introduce other changes.
```

The format is stable so the agent can rely on its structure. The
"Please address these" closing line is fixed.

Comments are grouped by file. Within a file, sorted by
`(turn.sequence, line_from)`. Each comment's line anchor references the
side of the diff (`before` / `after`) with readable phrasing:

- `after` → "(in your modification)"
- `before` → "(you removed these lines)"

### Composition service

A new `turn-feedback.pure.ts` takes a `TurnComment[]` + optional
instruction, returns the composed string. Fully deterministic and
testable.

### Sending

Backend `turn-feedback.service.ts`:

1. Look up `unaddressed = comments WHERE session_id = ? AND addressed_at IS NULL`.
2. Filter to selected ids (what the user checked in the dialog).
3. Build composed message via `turn-feedback.pure.ts`.
4. Call `sessionService.sendMessage(sessionId, { text: composed })`.
5. The new user message's turn id becomes the
   `addressed_in_turn_id`. The new turn starts normally via the
   existing `sendMessage` flow.
6. On successful dispatch, update all included comments:
   `addressed_at = now(), addressed_in_turn_id = newTurnId`.

If step 4 fails (session not active, provider error), steps 5-6 are
skipped and the user sees an error toast. No partial state.

### UI — action entry point

A floating pill appears in the session view header or near the
composer when `unaddressedCommentCount > 0`:

```
  ┌──────────────────────────────┐
  │  📝 Send 3 comments to agent │
  └──────────────────────────────┘
```

Click → dialog.

### UI — dialog

- Header: "Send review comments to agent"
- List of comments, grouped by turn (most recent first) → by file.
  Each comment row has:
  - checkbox (default: on)
  - truncated body
  - file + line anchor
- Preview pane (right side or below): the composed message as it will
  be sent. Updates live as checkboxes toggle.
- Optional instruction textarea at the bottom: "Anything specific the
  agent should know?"
- Footer: `Send to agent` (primary), `Cancel`.

### Re-opening

Each addressed comment has a kebab menu item "Re-open for feedback."
Setting `addressed_at = null, addressed_in_turn_id = null` makes it
eligible for the next send.

## Acceptance criteria

- With at least one comment in the session with `addressed_at = null`,
  a "Send N comments to agent" pill is visible.
- Clicking opens the dialog with the correct count.
- Unchecking comments updates the live preview and the "N" count.
- Sending dispatches a normal user message to the session via the
  existing `sendMessage` path.
- Comments included in the send have `addressed_at` set and link to
  the new turn id.
- The pill disappears once all comments in the session are addressed.
- Re-opening an addressed comment restores the pill and its dimmed
  state is cleared.
- Composition is deterministic: same inputs produce the same message
  (verified by a pure test).
- All four gates pass.

## Implementation sketch

- Pure: `turn-feedback.pure.ts` with `composeFeedbackMessage(input) →
string`. Fully tested.
- Service: `turn-feedback.service.ts` wires the pure function into
  `sessionService.sendMessage`, then persists the "addressed" state.
- IPC: `turn-feedback:send(sessionId, commentIds, instruction)`.
- Renderer: entity already exists from the inline-comments feature.
  Add `turnsApi` or a new `turnFeedbackApi` entry. New
  `feedback-dialog.container.tsx` + presentational preview.

## Open questions

1. Should sending a follow-up automatically scope the agent? (e.g.
   rewrite system prompt to "focus on addressing these comments.")
   Suggest: no. Keep V1 as a plain user message; users can tune their
   own instruction if they want.
2. Do we show the composed message inside the transcript as a single
   user bubble, or as a special "feedback" item kind? (Suggest: plain
   user bubble — the agent shouldn't treat it specially and the
   transcript should stay uniform.)
3. What happens if the session is completed (not active) when the
   user tries to send? (Suggest: auto-start the session on send, same
   way the composer does today.)
4. Can the user send comments from an archived session? (Suggest: no
   in V1. Unarchive first.)

## Dependencies

- Required: `docs/specs/turn-inline-comments.md` must be implemented
  first. Without comments, there is nothing to send.
- Recommended (not strict): `docs/specs/turn-revert.md` — complementary
  but independent. Reviewers often want to revert a mistake before
  sending a follow-up; having both available makes the review flow
  richer.
