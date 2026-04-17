# Auto-Name Sessions

## Goal

Give every session a short, descriptive title generated from its content so the
sidebar list is scannable. Today the title is the first user message truncated
to 40 characters, which is often a generic instruction like "explore the
codebase" and tells the user nothing about what the session is actually about.

## Product intent

- Sessions get a short, content-derived title automatically after the first
  assistant turn finishes.
- Users can rename a session manually at any time.
- Users can ask Convergence to regenerate the title at any time.
- Naming uses the same provider as the session, but with the provider's
  smallest/fastest model. We do not assume any global naming model or any
  shared API key.
- Naming runs in the background. It must never block the UI or the user's next
  turn.
- Naming failures are silent. The session keeps whatever title it had.

## Non-goals

- No tracking of where the title came from (user vs. auto). One name field,
  freely overwritten by whichever path produces the latest title.
- No cross-provider abstraction or shared "naming model" config.
- No re-naming on every turn. Auto-name fires once after the first assistant
  turn. After that, only the explicit "regenerate" action re-runs it.
- No streaming UI for the naming call. It is a background one-shot.
- No cost/quota accounting for naming calls in V1.

## V1 behavior

### Auto-name trigger

- After the first assistant turn of a session completes successfully, the
  backend kicks off a background naming task for that session.
- The task uses the session's provider with the provider's designated fast
  model (see "Provider fast model" below).
- When the task returns, the backend updates `sessions.name` and emits the
  existing `session:updated` IPC event so the sidebar refreshes.
- If the task fails, errors out, or returns an empty/invalid title, the
  session keeps its current name. The error is logged but not surfaced.
- Auto-name fires at most once per session lifetime under normal operation.
  The trigger is gated by a "has this session ever been auto-named?" check;
  see "Persistence" below.

### Manual rename

- Sidebar session row gets a context menu (or inline edit on double-click)
  with two actions: **Rename** and **Regenerate name**.
- **Rename** opens an inline editor on the row. Submit writes directly to
  `sessions.name` via a new `session:rename` IPC handler.
- **Regenerate name** re-runs the same background naming task as the auto
  trigger, regardless of how the current name was produced.

### Naming prompt

The naming call sends a single user message to the fast model. Inputs:

- the first user message of the session (full text, capped to ~2k chars)
- the first assistant response (full text, capped to ~2k chars)

System / instruction prompt:

> Generate a concise 3-6 word title for this conversation. Use Title Case.
> No quotes. No trailing punctuation. Output only the title, nothing else.

Output handling:

- Trim whitespace, strip surrounding quotes, strip trailing punctuation.
- Reject if empty, longer than 80 characters, or contains newlines after the
  first line. On rejection, keep the existing name.

## Provider strategy

### Provider fast model

Add a `fastModelId: string` field to `ProviderDescriptor`. Each provider
declares which of its model IDs is the cheapest/fastest model suitable for
naming as the built-in default.

- Claude Code: `fastModelId: 'haiku'`
- Codex: `fastModelId: 'gpt-5.4-mini'`
- Pi: provider declares its own (e.g. smallest available Pi model)

The fast model also appears in the normal UI model picker — it is just a
regular model. The `fastModelId` field only marks "use this one for naming
when the user hasn't overridden it."

### User override (global app settings)

`AppSettings` already exists (`electron/backend/app-settings/`). Extend it
with an optional per-provider naming model map:

```ts
interface AppSettings {
  // existing
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null

  // new
  namingModelByProvider: Record<string, string> // providerId -> modelId
}
```

Resolution order for the model used by a naming call:

1. `appSettings.namingModelByProvider[providerId]` if set and valid for that
   provider's `modelOptions`
2. Provider descriptor's `fastModelId`
3. Provider's `defaultModelId` (last-resort fallback)

The settings UI (`src/features/app-settings/`) gets a new section: "Naming
model per provider" with a model picker per detected provider, defaulting
to the provider's `fastModelId`. Validation reuses the same pattern as the
existing `setAppSettings` (reject unknown providerId/modelId).

### One-shot completion capability

Add an optional capability to the `Provider` interface:

```ts
interface Provider {
  // existing
  describe(): ProviderDescriptor
  start(config): SessionHandle

  // new
  oneShot?(input: {
    prompt: string
    modelId: string
    cwd: string
  }): Promise<{ text: string }>
}
```

Implementation per provider:

- **Claude Code**: spawn `claude -p "<prompt>" --model <modelId>
--output-format json`, parse the JSON, return the assistant text.
- **Codex**: spawn `codex exec --model <modelId> "<prompt>"`, capture stdout,
  return the text. (Confirm exact flag during implementation; fall back to the
  same JSON-RPC surface used by `start()` if `exec` is unsuitable.)
- **Pi**: implement using whatever one-shot/exec surface the Pi binary
  exposes. If Pi has no headless mode, leave `oneShot` unimplemented; Pi
  sessions then skip auto-naming.

The `oneShot` call:

- runs detached from the user's session handle
- uses a hard timeout (e.g. 20s); on timeout, kill the child and reject
- inherits the session's working directory but no transcript or context
- writes nothing to the session transcript

If a provider does not implement `oneShot`, naming for that provider is a
no-op.

## Data model

No schema migration. The existing `sessions.name` column is updated in place
via the existing `SessionService.updateField` path and the existing
`session:updated` IPC event.

### Persistence: "already auto-named" gate

To avoid auto-naming the same session twice (e.g. if the app restarts
mid-session), we need a single flag. Two acceptable shapes; pick one during
implementation:

- Add a boolean `name_auto_generated` column to `sessions`. Set to `true` after
  the first successful auto-name. Auto trigger checks this flag and skips if
  true. Manual "Regenerate name" ignores the flag and always runs.
- Or store the flag inside the existing `context_window` JSON-style blob
  pattern (a small `naming` JSON column or a field on an existing JSON column)
  if we want to avoid a migration.

Recommendation: add the dedicated boolean column. It is cheap, explicit, and
easier to query than a nested JSON field.

This single flag is the only state we track. We do not record source-of-name
beyond it.

## IPC surface

New handlers:

- `session:rename` — payload `{ sessionId, name }`. Validates length (1..120),
  writes to DB, emits `session:updated`.
- `session:regenerateName` — payload `{ sessionId }`. Kicks off the background
  naming task. Returns immediately. The eventual title update arrives via
  `session:updated`.

Existing `session:updated` is reused for the actual name change broadcast.

## Renderer surface

- `src/widgets/sidebar/project-tree.container.tsx` session row gets:
  - inline rename affordance (double-click or kebab menu → Rename)
  - kebab menu item: "Regenerate name"
- `src/entities/session/session.api.ts` (or equivalent) gets `renameSession`
  and `regenerateSessionName` calls wired to the new IPC handlers.
- No change to the initial-name code path in `composer.container.tsx`. The
  truncated-first-message name remains as the placeholder until auto-name
  replaces it.

## Failure modes

- Provider CLI not installed → `oneShot` rejects → naming silently skipped.
- Provider CLI hangs → 20s timeout → killed → naming silently skipped.
- Model returns garbage / empty / >80 chars → rejected → existing name kept.
- App quits mid-naming → naming task is detached and the result is lost; the
  next session start does not retry. The user can hit "Regenerate name".
- DB write race between manual rename and auto-name landing → last writer
  wins. Acceptable in V1; a manual rename arriving after auto-name kickoff
  may briefly be overwritten. If this turns out to bite in practice, the
  auto-name path can check the flag again right before writing.

## Verification

- Unit: prompt builder caps input length, output sanitizer trims/rejects
  correctly.
- Unit: `oneShot` parsers for each provider handle success, error exit, and
  malformed output.
- Integration: starting a session, sending a first message, and waiting for
  the first assistant turn produces a renamed session within ~10s with a
  stub provider.
- Integration: `session:rename` updates the DB and broadcasts.
- Integration: `session:regenerateName` re-runs naming even after the
  auto-name flag is set.
- Manual smoke: real Claude Code and Codex sessions get sensible titles.

## Out of scope

- Renaming based on later turns (only first turn drives auto-name).
- Bulk re-naming of pre-existing sessions on upgrade.
- User configuration of the naming prompt or fast model selection.
- Showing a "naming…" spinner in the sidebar.
