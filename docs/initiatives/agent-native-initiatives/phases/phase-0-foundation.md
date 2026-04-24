# Phase 0: Foundation And Data Model

## Product Goal

Add the persisted Initiative domain without changing visible app behavior.

Phase 0 gives later phases a stable service/API/store foundation for global
Initiatives, linked session Attempts, and Initiative Outputs.

## Current Repo State

- SQLite schema is centralized in `electron/backend/database/database.ts`.
- Schema evolution uses `CREATE TABLE IF NOT EXISTS` blocks plus focused
  `ensure*` helpers where existing tables need new columns.
- Backend row interfaces live in
  `electron/backend/database/database.types.ts`.
- Backend domain services live under `electron/backend/*`.
- Main-process IPC registration is centralized in `electron/main/ipc.ts` for
  core app domains.
- Preload APIs are exposed from `electron/preload/index.ts`.
- Renderer entity slices live under `src/entities/*` with:
  - `*.types.ts`
  - `*.api.ts`
  - `*.model.ts`
  - `index.ts`
- Tests are colocated with source files and split into pure/unit suites.

## No Current External Research Needed

This phase is local data modeling and repo plumbing. It does not depend on
unstable external APIs, provider behavior, or 2026 product conventions.

## Data Contracts

### Initiative

```ts
type InitiativeStatus =
  | 'exploring'
  | 'planned'
  | 'implementing'
  | 'reviewing'
  | 'ready-to-merge'
  | 'merged'
  | 'released'
  | 'parked'
  | 'discarded'

type InitiativeAttention =
  | 'none'
  | 'needs-you'
  | 'needs-decision'
  | 'blocked'
  | 'stale'

interface Initiative {
  id: string
  title: string
  status: InitiativeStatus
  attention: InitiativeAttention
  currentUnderstanding: string
  createdAt: string
  updatedAt: string
}
```

Initiatives are global. Do not add `project_id` to the `initiatives` table.

### Initiative Attempt

```ts
type InitiativeAttemptRole =
  | 'seed'
  | 'exploration'
  | 'implementation'
  | 'review'
  | 'hardening'
  | 'docs'

interface InitiativeAttempt {
  id: string
  initiativeId: string
  sessionId: string
  role: InitiativeAttemptRole
  isPrimary: boolean
  createdAt: string
}
```

An Initiative has many Attempts. One Attempt may be primary, but the domain is
not single-session-centric.

### Initiative Output

```ts
type InitiativeOutputKind =
  | 'pull-request'
  | 'branch'
  | 'commit-range'
  | 'release'
  | 'spec'
  | 'documentation'
  | 'migration-note'
  | 'external-issue'
  | 'other'

type InitiativeOutputStatus =
  | 'planned'
  | 'in-progress'
  | 'ready'
  | 'merged'
  | 'released'
  | 'abandoned'

interface InitiativeOutput {
  id: string
  initiativeId: string
  kind: InitiativeOutputKind
  label: string
  value: string
  sourceSessionId: string | null
  status: InitiativeOutputStatus
  createdAt: string
  updatedAt: string
}
```

## Backend Contracts

Add `electron/backend/initiative/`.

Suggested files:

- `initiative.types.ts`
- `initiative.pure.ts`
- `initiative.service.ts`
- `initiative.service.test.ts`
- `initiative.pure.test.ts`

Service methods:

- `list(): Initiative[]`
- `getById(id): Initiative | null`
- `create(input): Initiative`
- `update(id, input): Initiative`
- `delete(id): void`
- `listAttempts(initiativeId): InitiativeAttempt[]`
- `linkAttempt(input): InitiativeAttempt`
- `unlinkAttempt(id): void`
- `setPrimaryAttempt(initiativeId, attemptId): InitiativeAttempt`
- `listOutputs(initiativeId): InitiativeOutput[]`
- `addOutput(input): InitiativeOutput`
- `updateOutput(id, input): InitiativeOutput`
- `deleteOutput(id): void`

Validation rules:

- Initiative title is required and trimmed.
- Current understanding defaults to an empty string.
- Status defaults to `exploring`.
- Attention defaults to `none`.
- Attempt role defaults to `exploration`, except create-from-session in later
  phases will use `seed`.
- Duplicate `(initiative_id, session_id)` Attempt links are not allowed.
- Setting a primary Attempt clears `is_primary` on other Attempts in the same
  Initiative.
- Output label and value are required and trimmed.
- Output status defaults to `planned`.

## IPC And Renderer Contracts

Add `initiative` under `window.electronAPI`.

Renderer slice:

- `src/entities/initiative/initiative.types.ts`
- `src/entities/initiative/initiative.api.ts`
- `src/entities/initiative/initiative.model.ts`
- `src/entities/initiative/index.ts`

Store state should cover:

- `initiatives`
- `attemptsByInitiativeId`
- `outputsByInitiativeId`
- `loading`
- `error`

Store actions should cover the service methods needed by later phases.

## Out Of Scope

- No Workboard UI.
- No session-view Initiative panel.
- No create-from-session UI.
- No AI synthesis.
- No output discovery.
- No direct model API calls.

## Automated Tests

Add or update tests for:

- database creates Initiative tables and constraints
- row-to-domain mapping and enum normalization
- Initiative CRUD
- Attempt link/unlink and duplicate prevention
- primary Attempt behavior
- Output CRUD
- renderer store loading and mutation actions

## Manual Check

No meaningful user-facing manual check is expected in Phase 0.

After implementation, the user can run `npm run dev` and verify that the app
opens normally and existing project/session navigation still works. There
should be no visible Initiative UI yet.

## Risks

- Primary Attempt consistency should be enforced transactionally.
- Cross-project linking depends on Attempts referencing sessions directly, not
  storing project ownership on Initiatives.
- Chaperone may touch unrelated terminal/session files when run with `--fix`;
  restore unrelated edits before completing the phase.
