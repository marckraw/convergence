# Convergence Architecture Quick Reference

Every code path in this document is relative to the `apps/convergence`
workspace (MAR-2706), not the repository root — with one exception, stated
where it applies: **"Workspace layout" below is repository-relative**, because
paths that name a sibling workspace have no meaning read from inside one
(MAR-2737).

## Product direction

Convergence is a UI-first desktop app for managing agent work across local codebases.

Initial product focus:

- first-class agent sessions for Claude Code and Codex
- project-centered workflows
- a strong attention surface: waiting on you, needs review, archived history
- no embedded terminal in the first phases

Later product focus:

- terminal support
- richer project structures with multiple repositories
- remotely reachable clients, cloud control plane, and execution-host
  boundaries as described in `docs/specs/convergence-v2-boundaries.md`
- broader provider support if needed

## Workspace layout (MAR-2706, MAR-2737)

**Every path in this section is relative to the repository root**, not to
`apps/convergence`. The rest of the document resumes the workspace-relative
base at "Core architectural choices".

The repository is an npm-workspaces monorepo:

- `apps/convergence` — the app this document is otherwise about.
- `apps/backpack-studio` — Backpack Studio, the second body: a remote-only
  creation app for the EF disciplines. At this stage a shell that boots and
  consumes the shared client core; its constitution is MAR-2705.
- `packages/execution-host-client` — the daemon client core, shared.

### The client-core boundary

`@convergence/execution-host-client` owns everything that reads an
agents-daemon's own bytes: the `/health` handshake, the Projects listing, the
configuration and capability fingerprints an answer is only true under, the
`/v0/meta`, start-response and session-snapshot parsers, the SSE reader, and
the wire trace. It depends on `@mrck-labs/execution-host-protocol` and on
nothing else.

It owns none of Convergence's vocabulary. The `ProviderExecutionHost` adapter,
its registry, `execution-host-wire-mapping.pure.ts` and every
`ProviderDescriptor` or `ProviderCatalogEntry` derived from a listing stay in
`apps/convergence` and import the package — because they name the session
record, and the package must stay usable by an app that has none.

Three rules follow, and all three are load-bearing:

- **The package may never import an app.** Where it would have had to, it
  declares a structural port instead: `EndpointConfigurationSource` and
  `TokenSource`, satisfied by Convergence's own services with no adapter class.
  A `ProviderDescriptor` import appearing in this package is the signal that a
  function is on the wrong side of the line. It is enforced, not merely written
  down — see "The enforcing organ" below — and it is enforced one step tighter
  here than in the apps: a _production_ file may reach only the package's
  `dependencies`, today exactly `@mrck-labs/execution-host-protocol`, so a test
  runner or a compiler cannot quietly become client-core vocabulary.
  `devDependencies` are legal in `*.test.ts` **and nowhere else**: a
  `*.fixture.ts` here is re-exported from `index.ts`, which makes it public
  surface by construction, so `Mock` reaching one of them stands in the
  package's own types exactly like a compiler type would. The rule exists
  because a used, type-only app import into this package once passed typecheck,
  both builds and chaperone with nothing to say, and the fixture spelling of the
  same leak passed a tripwire written to catch it (MAR-2737).
- **Apps import it by package name**, never by a relative path into
  `packages/`, never through `node_modules/…/src/…`, and never by a subpath its
  `exports` map does not open. Declaring a workspace buys the right to depend on
  it, not the right to reach past its front door; every other spelling lands on
  a private file that disappears the day the package builds to `dist` or
  publishes. This is enforced, not a convention — see "The enforcing organ".
  It also publishes TypeScript source through `exports`, so every consumer must
  _bundle_ it: both electron-vite configs list it in
  `BUNDLED_WORKSPACE_PACKAGES` and exclude it from `externalizeDepsPlugin`.
  Externalizing it would emit a `require` the packaged app cannot resolve — a
  failure that reaches a user's machine and no gate.
- **No app may import another app**, by any spelling — the workspace name
  (`convergence/…`), a relative climb (`../../../convergence/src/…`), a path
  through `node_modules/` or `apps/`, and every normalized variant of those.
  This is a separate question from the FSD layer map, which asks about
  _layers_: with both apps' layers in one map, Backpack Studio importing
  Convergence's `DialogKind` read as a legal `app → entities` direction and
  passed every gate. Direction rules are about layers; identity rules are about
  workspaces (MAR-2737).

Extraction is by demand. More moves when a second app actually needs it, not
before.

### The enforcing organ

All three rules above are enforced by one thing, and it is a test, not a
chaperone rule: `workspace-import-ownership.ts` at the repository root, driven
by a `workspace-import-ownership.test.ts` in each workspace's pure tier. It
walks that workspace's own trees — `src/**` **and** `electron/**` for an app,
`src/**` for a package — resolves every import specifier with
`ts.resolveModuleName` under that tree's real tsconfig, and judges the
**resolved absolute path**: it must lie inside the owning workspace, or inside
a `node_modules/<name>` whose `<name>` that workspace declares in its own
manifest, or inside a sibling workspace that is both declared **and spelled as
its package name**. Anything else fails by resolved path, printed with the
offending specifier, its file, and — for a reach-through — the legal spelling to
write instead; a specifier the resolver cannot place fails loud rather than
being skipped.

The sweep is proved end to end, not just the judgement. Each driver builds a
miniature monorepo in a temporary directory, plants real forbidden imports in
every tree its own configuration scans, and asserts they come back out of
`violations()` with the right reason
(`workspace-import-ownership.fixture.ts`). Without it, replacing `violations()`
with `() => []` left every ownership suite green: the spelling matrices call the
classifier directly, and an inert sweep reads exactly like a clean tree. One of
the planted imports in every tree is written `import type`, and the reader that
finds it is pinned form by form — static, re-export, `import type`, dynamic
`import()`, `import()` types, import-equals, `require()` — in
`workspace-import-ownership.syntax.test.ts`. Both exist for the same reason:
with every plant written as a value import, dropping type-only declarations
from the reader left all three suites green while the type-only reach that
opened MAR-2737 passed every gate. And that form is read back off the emitted
file's own AST before the temporary tree is removed, never taken from the
metadata that asked for it: an assertion must read the artifact, not the intent
that produced it — a fixture whose writer stopped honouring the request kept
every metadata-shaped assertion green over value-import files.

It is a test because the question is a resolution question and chaperone's rule
kinds are textual. Three rounds of MAR-2737 tried to answer it with patterns —
no rule, then a spelling blocklist, then an allowlist — and each lost to the
next spelling: `../../.././convergence/src/…` reaches the same file as
`../../../convergence/src/…`, and no pattern that must see `../` and a
workspace name adjacent can tell. Spelling is irrelevant to a resolved path,
including a spelling nobody has written yet. One fact, one organ.

One question it deliberately does not answer: whether a renderer may import
Electron, or reach across FSD layers, belongs to chaperone's renderer rules
below. "Import the package by its name" used to be the second — round 4 left it
a convention on the grounds that a relative path into a **declared** package
still resolves to a declared dependency — and round 5 made it a rule, because
ownership and the `exports` contract are two different questions and only the
first was being asked.

## Core architectural choices

### 1. Electron + Node backend

Convergence replaces Divergence's Tauri + Rust backend with Electron + Node.

Suggested process layout:

- `electron/main`: window lifecycle, IPC registration, app bootstrap
- `electron/preload`: safe renderer bridge
- `electron/backend`: backend features and services
- `src`: renderer app only

The renderer must never depend directly on Node or Electron APIs outside approved `*.api.ts` boundaries.

### 2. FSD-lite renderer

Renderer code stays close to Divergence:

- `src/app`
- `src/widgets`
- `src/features`
- `src/entities`
- `src/shared`

Keep slice public APIs in `index.ts` files. Avoid deep imports across slices.

These renderer laws bind **every app's renderer**, not only Convergence's:
chaperone's renderer rules glob `apps/*/src`, so Backpack Studio inherits the
direct-Electron ban, the presentational boundaries, the FSD public-API rule and
the `.pure.ts` test pairing on the day it is created. The public-API rule
rejects both the alias spelling (`@/features/x/y`) and the relative one
(`../features/x/y`), because an app without a `@/` alias of its own would
otherwise be unbound. Rules that name Convergence's own design system — the
raw-`<button>`/`<input>` warnings — stay scoped to `apps/convergence` and say so
in their message (MAR-2737).

Because the layer map is shared, every app's layers live in one logical set, and
these rules answer only "may this layer import that layer?" — never "whose app
is that?". The second question belongs to the workspace-ownership test ("The
enforcing organ" above), and it needs its own organ: a Studio import of
Convergence's `entities` is a legal `app → entities` direction and passes all of
the above (MAR-2737).

### 3. UI-first agent runtime

The transcript is the primary surface. Debug information, changed files, queue views, and project tools are secondary surfaces.

Design rule:

- one stable header
- one stable transcript scroll container
- one composer
- side panels and drawers for secondary concerns

Avoid the Divergence failure mode where the transcript competes with telemetry, approvals, debug panels, and changed files in the same vertical stack.

### 4. Provider-neutral session model

Session state should be provider-neutral and capable of representing:

- user messages
- assistant messages
- streaming status
- approvals
- user-input requests
- runtime phases
- attention state
- session completion and failure
- working-set lifecycle metadata such as archive state

Claude Code and Codex adapters should map into one shared session snapshot model.

### 5. Project model

Phase 1 project model:

- one project
- one local repository root

The data model must be extendable to:

- one project with multiple repositories
- copied project variants
- project-level settings and ignore rules

Do not hardcode assumptions that permanently tie a project to only one repository path.

### 6. Project copy strategy

Convergence keeps the Divergence idea of copying a project root into a new working directory with a skip list.

Requirements:

- configurable ignore copy skip list
- deterministic copy destination rules
- safe handling of large or generated directories
- project metadata that records source and copied locations

### 7. Session attachments

Sessions support image, PDF, and UTF-8 text attachments on outgoing messages:

- **Entity:** `src/entities/attachment/` (types, api, zustand store with `drafts` per composer session and `resolved` per session-view session, plus chip / row / preview / missing-chip presentationals shared by composer and transcript)
- **Backend:** `electron/backend/attachments/` handles ingest-from-bytes / ingest-from-paths, EXIF stripping, MIME sniffing, per-session directory storage under `userData/attachments/{sessionId}/`, orphan sweep on boot, and FK-cascade deletion
- **Provider serializers** live next to each adapter:
  - `claude-code/claude-code-message.pure.ts` → Anthropic `content[]` blocks (image/document/text)
  - `codex/codex-message.pure.ts` → `UserInput[]` (`localImage` + inline text)
  - `pi/pi-message.pure.ts` → `{message, images?}` per Pi rpc schema
- **Capability matrix** is exposed on `ProviderDescriptor.attachments`; renderer gates on `selection.provider.attachments` via `src/features/composer/attachment-capability.pure.ts`
- **UI surface:** composer `+` button (file picker), textarea `onPaste`, composer root drag-and-drop, chip row with preview modal
- **History rendering:** `src/widgets/session-view/conversation-item.container.tsx` resolves `entry.attachmentIds` against the `useAttachmentStore` resolved map (hydrated once per session-view mount via `attachments:getForSession`); user messages render chips below text, with a `MissingAttachmentChip` fallback for orphaned ids
- **Persistence:** attachment ids live on normalized user `ConversationItem` payloads; attachment rows live in dedicated `attachments` table
- **PDFs are Claude-Code-only**; Codex and Pi providers report `supportsPdf: false` and the composer surfaces a capability error with red chip outline + send-disabled state

Full spec: `docs/specs/session-attachments.md`. History-render + post-normalization regression fix: `docs/specs/attachments-in-history.md`.

### 8. Mid-run session input

Providers advertise running-session input support through
`ProviderDescriptor.midRunInput`; the renderer must gate composer modes through
that capability instead of guessing from provider id.

Supported V1 behavior:

- Claude Code: app-managed queued follow-up while running; no advertised steer
  or interrupt until the dedicated streaming-adapter refactor.
- Codex: app-managed queued follow-up, `answer` for provider user-input
  requests, and native `turn/steer` for steering an active turn.
- Pi: native `follow_up` and `steer` commands while running.

Queued follow-ups are persisted in `session_queued_inputs`, broadcast through
session queue patch IPC, rendered near the composer, and cancellable while
still in `queued` state. Full spec:
`docs/specs/mid-run-session-input.md`.

### 9. Auto-updates

Packaged builds self-update from public GitHub Releases via
`electron-updater`. A `UpdatesService` wraps the updater behind
IPC; a scheduler runs a startup check (+10s) and a 4h interval.
The user is always asked before download and before install.
Dev mode (`app.isPackaged === false`) short-circuits every update
code path. Full spec: `docs/specs/auto-updates.md`.

### 10. Flows: the relay engine

Crews can hold **relays** — wires that carry a finished session's last
assistant message into another session, or into one the wire opens. The
engine (`electron/backend/relay/`) is deterministic and dumb by design:
Convergence is the switchboard, agents never call agents.

Four laws bind it: no silent hops (every firing writes a ledger row), the
loop law (a wire fires once per flow run, carried by an in-memory one-shot
ancestry baton), the vocabulary law (write a union, read a plain string, so
rows from another build still render), and the quota law (relay tests reach
providers through narrow fake gateways and no other way).

A wire may also carry an **opener** — a first message such as `/clear`, sent
on its own with the payload queued behind it, which turns a long-lived target
into a recycled worker wiped and re-briefed every lap. It rides a deliberately
narrow one-caller seam (`skipContextInjection`) so the command reaches the
provider byte for byte; do not widen it.

How to add a trigger, an action or a payload transform — with the real file
lists and the rulings behind them — is
`docs/architecture/relay-engine.md`. Product doctrine lives in the Linear
document "Flows — constitution & staged map".

### 11. Verification rules

After every finished task, the expected verification flow is:

- `npm install`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

Phase 0 must bootstrap the repo until these commands are real and useful.
