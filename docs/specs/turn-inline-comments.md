# Turn Inline Comments

**Status:** Phase B. Builds on `docs/specs/turn-grouped-file-changes.md`.
No V1 work until `turn-grouped-file-changes` is merged.

## Goal

Let the developer leave targeted, line-level annotations on the diffs the
agent produced in a turn. Reading the extended panel today is one-way: you
can see what the agent did, but you cannot capture any reaction to it inside
the app. Inline comments close that loop — they give the reviewer a place to
write down "this line looks wrong," "rename this variable," or "this is the
subtle bug" without leaving the session.

Comments are read-only signals in this spec — they do not modify code and do
not automatically feed back to the agent. The follow-up "send to agent"
pathway is covered in `docs/specs/turn-feedback-loop.md`.

## Product intent

- Reviewer hovers a line in the diff viewer (extended view, per-turn diff)
  and a small "+ Comment" affordance appears.
- Clicking the affordance opens an inline editor (single-line or multi-line
  markdown textarea) anchored to that line.
- Submitting stores the comment persistently, keyed by
  `(turnId, filePath, lineFrom, lineTo)`.
- Comments render as margin annotations next to the affected lines, with
  author attribution ("you" — there is only one user) and a timestamp.
- A turn card in the panel shows a small badge with the total comment count
  across its files.
- Multiple comments can be left on the same line range (most recent first).
- Editing and deleting one's own comments is supported. No threading, no
  reactions, no @mentions.
- Comments persist across app restarts. They live in local SQLite with the
  session.
- Comments do not modify code. They are purely annotational in this spec.

## Non-goals

- No threaded replies. A comment cannot have child comments.
- No reactions (👍 / 👎).
- No @mentions, no multi-user. This is a single-user review tool.
- No comment resolution workflow ("mark as resolved"). Either it exists or
  the user deletes it.
- No export. Comments are not surfaced outside the app in V1.
- No auto-feedback to the agent. Even if the comment says "fix this," the
  agent is not told. That is `turn-feedback-loop.md`.
- No migration path for existing turns (comments only apply to turns that
  already have the turn record from the base feature — all turns once
  `turn-grouped-file-changes` is live).
- No inline comments on the **compact** view. Only the extended per-turn
  diff view hosts them.

## V1 behavior

### Data model

New table `session_turn_file_comments`:

```sql
CREATE TABLE IF NOT EXISTS session_turn_file_comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_from INTEGER NOT NULL,     -- 1-based, inclusive, in the per-turn diff body
  line_to INTEGER NOT NULL,       -- 1-based, inclusive; equals line_from for single-line
  side TEXT NOT NULL,             -- 'before' | 'after' — which side of the diff the anchor is on
  body TEXT NOT NULL,             -- markdown text
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (turn_id) REFERENCES session_turns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_turn_file_comments_turn_file
  ON session_turn_file_comments(turn_id, file_path);
```

Anchor semantics:

- `line_from` / `line_to` index into the **per-turn unified diff body** as
  it was rendered when the comment was authored.
- `side = 'before'` means the anchor is on the red (removed) side;
  `'after'` means the green (added) side. Context lines anchor to `'after'`
  by default.
- If a later action (revert, rewrite) changes the diff, existing comments
  stay attached but may visually misalign. UI surfaces this as a
  `stale: true` badge (see below).

### UI — comment affordance

- In `diff-viewer.presentational.tsx` (extended view path only), on hover
  of a line, a "+" button appears on the gutter.
- Clicking the button opens an inline editor directly below the line:
  markdown textarea, `Save` and `Cancel` buttons, `Cmd+Enter` submits.
- After submission, the comment renders as a small indented block below
  the line, with:
  - author avatar/initials (fixed "You")
  - timestamp (relative: "2 min ago", absolute on hover)
  - markdown body
  - edit/delete kebab menu (owner only — which is always "you" in V1)
- Multiple comments on the same line stack in creation order.

### UI — turn card badge

- Each `TurnCard` surfaces `commentCount` as a small speech-bubble icon
  next to the file-count chip.
- Per-file row in the expanded turn card surfaces its own comment count.

### Data access

- Loaded lazily per turn when a turn card expands (batch fetch for all
  files in the turn).
- Stored to a renderer cache by `(turnId, filePath)`.
- Real-time updates within the session are reflected locally — no IPC
  broadcast needed, since only one window authors at a time.

### IPC surface

New channels:

- `turn-comments:listForTurn(turnId) → TurnComment[]`
- `turn-comments:create(input) → TurnComment`
- `turn-comments:update(id, body) → TurnComment`
- `turn-comments:delete(id) → void`

No streaming / delta channel — local, single-window, low latency.

### Edge cases

- **Turn is deleted.** Comments cascade via FK.
- **Session is deleted.** Comments cascade via FK.
- **Diff truncation.** If the per-turn diff was truncated (> 200 KB),
  comments can still be created but the anchor is whatever the truncation
  marker shows. `stale: true` applies immediately. Acceptable.
- **Edit window.** No edit window. User can edit / delete any time.
- **Empty body submission.** Rejected in UI; not persisted.
- **Very long body.** Soft cap at 8 KB per comment; hard cap at 16 KB
  rejected at service layer. Markdown rendered via existing
  `react-markdown` used elsewhere.

## Acceptance criteria

- Hovering a line in a per-turn diff shows a "+" affordance; clicking
  opens an inline editor.
- Submitting writes a row to `session_turn_file_comments` with correct
  anchor fields, and renders immediately inline.
- Count badges on the turn card and file rows reflect the number of
  comments live.
- Editing and deleting a comment work and persist.
- Comments render across app restart.
- Deleting the session cascades all its comments.
- `npm run test:pure`, `test:unit`, `typecheck`, `chaperone check --fix`
  all pass.

## Implementation sketch

- Backend service `turn-comments.service.ts` under
  `electron/backend/session/turn/`. Thin CRUD over the new table.
- Backend pure helpers for body validation and anchor normalization.
- IPC handlers + preload surface + renderer entity at
  `src/entities/turn-comment/`.
- New presentational `turn-comment.presentational.tsx` +
  `comment-composer.presentational.tsx`.
- `diff-viewer.presentational.tsx` needs to expose per-line hover
  callbacks so the container wrapping it (a new
  `turn-diff-view.container.tsx`?) can mount comment UI. May require
  extracting a light container around the diff viewer to keep the
  presentational file stateless per project rules.

## Open questions

1. Should comments persist after the session is archived? (Suggest: yes;
   archived sessions keep full data.)
2. Do we render comment bodies as markdown or plaintext? (Suggest:
   markdown, using existing `react-markdown` setup — trivial and
   consistent with messages.)
3. Do we store a user-id / author field for future multi-user? (Suggest:
   no — the migration cost if we ever go multi-user is trivial vs the
   complexity of modeling it now.)
4. How do we visually mark stale-anchor comments when a revert happens
   later? (Punt until the revert feature lands — see
   `docs/specs/turn-revert.md`.)
