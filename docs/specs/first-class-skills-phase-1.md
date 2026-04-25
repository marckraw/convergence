# First-Class Skills Phase 1: Backend Catalog Substrate

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 1 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Build the first provider-neutral backend substrate for skill catalogs and prove
it with Codex's native app-server `skills/list` API.

This phase should make skills inspectable through IPC/preload from devtools. It
should not add visible product UI, composer selection, transcript metadata, or
provider invocation yet.

## Current Code Anchors

- Provider detection and binary paths:
  - `electron/backend/provider/detect.ts`
  - `electron/main/index.ts`
- Provider registry:
  - `electron/backend/provider/provider-registry.ts`
- Existing provider descriptors:
  - `electron/backend/provider/provider.types.ts`
  - `electron/backend/provider/provider-descriptor.pure.ts`
- Codex app-server session runtime:
  - `electron/backend/provider/codex/codex-provider.ts`
  - `electron/backend/provider/codex/jsonrpc.ts`
- Similar project-scoped backend feature:
  - `electron/backend/mcp/mcp.service.ts`
  - `electron/backend/mcp/mcp.types.ts`
  - `electron/backend/mcp/codex-mcp.service.ts`
- IPC/preload/type bridge:
  - `electron/main/ipc.ts`
  - `electron/preload/index.ts`
  - `src/shared/types/electron-api.d.ts`

## In Scope

- Backend normalized skill catalog types.
- Codex catalog adapter using native app-server `skills/list`.
- Project-scoped skills service.
- Provider-grouped response with per-provider errors.
- Manual refresh support through `forceReload`.
- IPC/preload bridge for devtools validation.
- Shared Electron API types.
- Focused pure and service tests.

## Out Of Scope

- Skills browser UI.
- Composer skill picker.
- Session start/send-message skill selections.
- Transcript skill chips.
- Reading full `SKILL.md` details.
- Claude Code and Pi catalogs.
- Skill invocation.
- Activation telemetry.
- Skill enable/disable.
- Long-lived watchers for `skills/changed`.
- Marketplace, installation, editing, or creation flows.

## Runtime Strategy

Phase 1 should not reuse a live Codex session's app-server process. It should
create a short-lived catalog request path:

1. Spawn `codex app-server` using the detected Codex binary.
2. Initialize it with the same app-server handshake style used by
   `CodexProvider`.
3. Call `skills/list` with the selected project repository path in `cwds`.
4. Pass through `forceReload` when requested.
5. Drain stderr, return a provider error on failure, and terminate the process.

This keeps the catalog feature independent from session lifecycle. Later phases
can optimize to reuse a long-lived metadata process if needed.

Use a timeout so a broken app-server cannot hang the UI. A 10 second default is
reasonable for Phase 1. The timeout should produce a provider-level error, not
a global IPC failure.

## Data Contract

Add backend types under `electron/backend/skills/skills.types.ts`.

Recommended shape:

```ts
export type SkillProviderId = 'codex' | 'claude-code' | 'pi'

export type SkillCatalogSource =
  | 'native-rpc'
  | 'native-cli'
  | 'filesystem'
  | 'unsupported'

export type SkillInvocationSupport =
  | 'structured-input'
  | 'native-command'
  | 'unsupported'

export type SkillActivationConfirmation = 'native-event' | 'none'

export type SkillScope =
  | 'product'
  | 'system'
  | 'global'
  | 'user'
  | 'project'
  | 'plugin'
  | 'admin'
  | 'team'
  | 'settings'
  | 'unknown'

export type SkillDependencyState =
  | 'declared'
  | 'available'
  | 'needs-auth'
  | 'needs-install'
  | 'unknown'

export interface SkillDependency {
  kind: 'mcp' | 'app' | 'tool' | 'script' | 'package' | 'other'
  name: string
  state: SkillDependencyState
  raw?: unknown
}

export type SkillWarningCode =
  | 'duplicate-name'
  | 'disabled'
  | 'missing-path'
  | 'missing-description'
  | 'unknown-scope'
  | 'provider-error'

export interface SkillWarning {
  code: SkillWarningCode
  message: string
}

export interface SkillRef {
  providerId: SkillProviderId
  name: string
  path: string | null
  scope: SkillScope
  rawScope: string | null
}

export interface SkillCatalogEntry extends SkillRef {
  id: string
  providerName: string
  displayName: string
  description: string
  shortDescription: string | null
  sourceLabel: string
  enabled: boolean
  dependencies: SkillDependency[]
  warnings: SkillWarning[]
}

export interface ProviderSkillCatalog {
  providerId: SkillProviderId
  providerName: string
  catalogSource: SkillCatalogSource
  invocationSupport: SkillInvocationSupport
  activationConfirmation: SkillActivationConfirmation
  skills: SkillCatalogEntry[]
  error: string | null
}

export interface ProjectSkillCatalog {
  projectId: string
  projectName: string
  providers: ProviderSkillCatalog[]
  refreshedAt: string
}

export interface SkillCatalogOptions {
  forceReload?: boolean
}
```

The exact names can be adjusted during implementation, but the response must
remain provider-grouped and must not use skill name as a unique key.

## Stable IDs

Add a pure helper for stable catalog IDs.

Input identity should include:

- provider ID
- normalized scope
- raw scope/source when available
- path when available
- name as fallback only

Recommended implementation:

```ts
skill:${providerId}:${sha256(identity).slice(0, 16)}
```

Use normalized absolute paths for path-based identities. Do not leak arbitrary
raw JSON into IDs.

## Codex Scope Mapping

Codex app-server currently exposes provider-owned scope/source metadata. Phase
1 should preserve raw values and normalize for UI-friendly grouping.

Recommended mapping:

| Raw value    | Normalized `SkillScope` | Label   |
| ------------ | ----------------------- | ------- |
| `repo`       | `project`               | Project |
| `project`    | `project`               | Project |
| `user`       | `user`                  | User    |
| `global`     | `global`                | Global  |
| `system`     | `system`                | System  |
| `admin`      | `admin`                 | Admin   |
| `plugin`     | `plugin`                | Plugin  |
| unknown/null | `unknown`               | Unknown |

Unknown scopes should still return entries with an `unknown-scope` warning.

## Codex Mapping Rules

The Codex adapter should map app-server entries conservatively:

- `name`: required string. Entries without a usable name are skipped.
- `path`: absolute `SKILL.md` path when provided; otherwise `null` with
  `missing-path` warning.
- `description`: from `description`, falling back to interface short
  description, then empty string plus `missing-description` warning.
- `displayName`: from `interface.displayName`, falling back to `name`.
- `shortDescription`: from `interface.shortDescription`, then `description`,
  then `null`.
- `enabled`: false only when app-server explicitly reports false.
- `dependencies`: map only known dependency arrays/objects; preserve unknown
  raw values as `kind: 'other'` with `state: 'declared'`.
- duplicate names within the same provider catalog should add `duplicate-name`
  warnings to all duplicate entries.

The mapper should keep app-server payload parsing tolerant. If the exact
response wrapper changes but entries are still findable under a known property,
the mapper should remain easy to update without touching IPC or renderer types.

## Service Design

Add `SkillsService` under `electron/backend/skills/skills.service.ts`.

Constructor dependencies:

- `ProjectService`
- detected providers from `detectProviders()`
- optional clock for tests

Behavior:

- Resolve `projectId` through `ProjectService`.
- Return `Project not found` as a thrown IPC error, matching existing MCP
  behavior.
- Include only installed conversational providers for Phase 1.
- For `codex`, call `CodexSkillsService`.
- For other providers in Phase 1, either omit them or include an unsupported
  provider section only if the renderer contract needs it. Recommendation:
  include only Codex for now to keep manual validation unambiguous.
- Convert provider failures into `ProviderSkillCatalog.error`.
- Never fail the whole catalog because one provider failed.

## Codex App-Server Client

Add a small app-server client/facade instead of embedding process details in
the mapper.

Suggested files:

- `electron/backend/provider/codex/codex-app-server-client.ts`
- `electron/backend/skills/codex-skills.service.ts`
- `electron/backend/skills/codex-skills.mapper.pure.ts`

The client should:

- spawn `codex app-server`
- use existing `JsonRpcClient`
- request `initialize` with:
  - client name/title `convergence`
  - `capabilities.experimentalApi = true`
- notify `initialized`
- request `skills/list`
- terminate the child process in a `finally`
- expose dependency injection seams for tests

The service should not import renderer code and should not mutate Codex skill
config.

## IPC And Preload

Update `registerIpcHandlers` to receive `skillsService`.

Add IPC:

```ts
ipcMain.handle(
  'skills:listByProjectId',
  (_event, projectId: string, options?: SkillCatalogOptions) =>
    skillsService.listByProjectId(projectId, options),
)
```

Add preload:

```ts
skills: {
  listByProjectId: (projectId, options) =>
    ipcRenderer.invoke('skills:listByProjectId', projectId, options),
}
```

Update `src/shared/types/electron-api.d.ts` with the Phase 1 catalog types and
`ElectronAPI.skills`.

No renderer entity slice is needed in Phase 1. That belongs to Phase 2.

## Main Process Wiring

Update `electron/main/index.ts`:

- create `const skillsService = new SkillsService(projectService, detected)`
  after provider detection
- pass `skillsService` to `registerIpcHandlers`

This mirrors `McpService(projectService, detected)`.

## Provider Descriptor Capability

The top-level spec proposes a `ProviderDescriptor.skills` capability. Phase 1
may add it if the implementation is small and mechanical:

```ts
skills: {
  catalog: 'native-rpc',
  invocation: 'structured-input',
  activationConfirmation: 'none',
}
```

for Codex, with Claude/Pi/Shell values filled conservatively.

If adding descriptor capability creates broad renderer churn, defer it to Phase 2. The Phase 1 hard requirement is the `skills:listByProjectId` catalog IPC.

## Tests

Add focused tests before or alongside implementation.

Pure tests:

- scope normalization maps known Codex raw scopes
- unknown scopes produce `unknown` plus warning
- stable IDs differ by provider/path/scope and remain stable for same input
- duplicate names produce warnings on all duplicate entries
- Codex mapper handles:
  - normal enabled entry
  - disabled entry
  - entry with interface metadata
  - missing path
  - missing description
  - duplicate names

Service tests:

- project not found throws
- missing Codex provider returns empty providers or no Codex section according
  to final service choice
- Codex adapter success returns provider catalog
- Codex adapter failure returns provider catalog with `error`
- `forceReload` is forwarded to the adapter/client

Do not write tests that require a real Codex binary.

## Manual Validation

After Phase 1 implementation, run the app and validate from devtools:

```ts
const project = await window.electronAPI.project.getActive()
await window.electronAPI.skills.listByProjectId(project.id, {
  forceReload: true,
})
```

Expected:

- response includes `projectId`, `projectName`, `refreshedAt`
- response includes a Codex provider section when Codex is installed
- Codex section has `catalogSource: 'native-rpc'`
- Codex section has `invocationSupport: 'structured-input'`
- Codex section has `activationConfirmation: 'none'`
- skills include names, descriptions, paths when available, scopes, enabled
  states, and warnings
- duplicate skill names remain separate entries

Also validate failure behavior:

- temporarily use a bad Codex binary in a test seam or local debug path
- confirm the IPC response returns a provider-level error rather than throwing
  the whole request

## Verification

Run with Node from `.nvmrc`:

- `npm install`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

If `chaperone check --fix` reformats unrelated files, inspect and keep the
final diff scoped to Phase 1 work only.

## Definition Of Done

- `docs/specs/first-class-skills.md` still matches the implementation.
- `docs/specs/first-class-skills-plan.md` Phase 2 still makes sense, or is
  updated based on what landed.
- Phase 1 backend catalog IPC works from devtools.
- No UI is added yet.
- No provider invocation behavior changes.
- No skill scripts are executed.
- Required verification passes or failures are documented.
