# Agent Workboard Sandcastle Implementation Plan

## Purpose

This plan turns the Ralph loop research into an implementable Convergence
feature.

The product surface is the global **Agent Workboard**: one place to see
loop-ready issues from Linear and Jira, map them to Convergence projects, start
Sandcastle-backed per-project runs, and observe progress, blockers, review
state, logs, branches, and tracker write-back.

Use these names consistently:

- **Agent Workboard**: global Convergence UI/control plane.
- **Ralph loop**: repeated fresh-agent execution over durable task state.
- **Loop-ready issue**: tracker issue marked as ready for automation.
- **Sandcastle run**: one Sandcastle-backed execution inside one project/repo.
- **Run group**: Convergence grouping of one or more issues/runs in the
  Workboard.

Do not use the earlier misheard name "sotaloos".

## Core Product Decision

The Workboard is global. Sandcastle is repo-centric.

That means V1 should not try to make one Sandcastle invocation span many repos.
Instead:

```text
Agent Workboard
  syncs Linear/Jira issues globally
  maps each issue to a Convergence project
  composes runnable batches per project
  starts one Sandcastle run per project/task lane
  displays every run in one global dashboard
```

True multi-repo execution becomes a later coordination layer over multiple
single-repo Sandcastle runs.

## Product Boundaries

Convergence owns:

- global tracker source configuration, including Linear/Jira API tokens
- tracker sync and normalization
- project mapping
- Workboard state and persistence
- run composition UI
- run lifecycle state machine
- Sandcastle invocation from Electron backend
- progress/event persistence
- tracker comments/label write-back
- stop/retry/review/PR handoff controls

Project `.sandcastle/` owns:

- project-local prompts
- workflow files
- Dockerfile and sandbox setup
- project-specific setup and verification commands
- headless Sandcastle usability outside Convergence

Sandcastle owns:

- sandbox/worktree lifecycle
- provider CLI execution inside the sandbox
- iteration loop mechanics
- completion signal detection
- raw log files
- stream events and tool-call normalization
- commit collection and preserved failed worktrees

Provider auth remains owned by provider CLIs. Convergence should preflight and
mount subscription auth/config for Sandcastle, not store Claude/Codex secrets.

## V1 Experience

V1 should let a user do this:

1. Configure a Linear source and a Jira source.
2. Configure mapping rules from tracker metadata to Convergence projects.
3. Mark issues with `convergence-loop` plus `loop-ready`.
4. Open the global Agent Workboard.
5. See loop candidates grouped by mapped project.
6. See whether each mapped project has usable `.sandcastle/` setup.
7. Select one issue and start a Sandcastle smoke run.
8. Watch stage state, log preview, events, branch, commits, and errors.
9. Write a comment back to Linear/Jira.
10. Move the issue into review, blocked, done, or failed state.

V1 does not need unattended watch mode, multi-repo tasks, arbitrary template
script editing, GitHub Issues, PR creation, or full parallel planner workflows.

## Labels And Tracker State

Use portable labels first because they work in both Linear and Jira. Avoid
colons and spaces for Jira compatibility.

Visibility label:

- `convergence-loop`: issue is visible to the Agent Workboard.

State labels:

- `loop-candidate`: may be looped, but needs enrichment or cleanup.
- `loop-ready`: executable and selectable for a Sandcastle run.
- `loop-running`: Convergence has started a run.
- `loop-blocked`: run needs human input or missing environment/config.
- `loop-review`: implementation exists and needs review/handoff.
- `loop-done`: loop completed and write-back finished.
- `loop-failed`: automation failed and needs attention.

Rules:

- A Workboard issue needs `convergence-loop`.
- Exactly one `loop-*` state label should be active once Convergence owns the
  issue state.
- Convergence must not remove unknown human labels.
- Convergence should post a tracker comment before important label changes:
  start, block, fail, review, done.
- If a tracker uses native workflow states later, labels can become only the
  visibility/routing mechanism.

## Project Mapping

Do not rely only on labels for project mapping. Labels are useful as fallback,
but Convergence should own explicit mapping rules.

Mapping rule:

```text
tracker source + tracker filter -> Convergence project
```

Linear rule inputs:

- workspace
- team
- project
- labels
- future: custom fields

Jira rule inputs:

- site/cloud id
- Jira project key
- components
- labels
- JQL filter
- future: custom fields

Mapping output:

- Convergence project id
- repository path
- default workflow policy
- default provider/model/effort per stage
- branch prefix
- default sandbox mode
- optional concurrency limit

Manual label fallback:

- `cv-project-convergence`
- `cv-project-client-api`

The fallback should be supported but not be the primary long-term strategy.

## Sandcastle Invocation Model

Use Sandcastle as a library from the Electron backend.

V1 should productize known workflows instead of interpreting arbitrary
`.sandcastle/main.mts` as the Workboard control plane.

Supported workflow policies:

- `simple-loop`: one implementer stage.
- `sequential-reviewer`: implementer then reviewer.
- later: `parallel-planner`.
- later: `parallel-planner-with-review`.

For every run Convergence should pass:

- project cwd
- external issue metadata via prompt args/context
- selected workflow policy
- deterministic branch name
- deterministic log file path
- provider/model/effort per stage
- sandbox provider
- host auth/config mounts
- max iterations
- completion signal
- abort signal
- lifecycle hooks or known project setup/verification commands

Default branch pattern:

```text
sandcastle/{tracker-type}-{issue-key}-{slug}
```

Default log path:

```text
.sandcastle/logs/convergence/{run-id}/{stage-role}.log
```

Default mode should be explicit branch mode. Head mode is an advanced escape
hatch and should require clear UI warning.

## Provider Subscription Strategy

Preferred V1:

- Sandcastle-native provider classes.
- Docker image installs Linux-compatible `claude`, `codex`, and later `pi`
  CLIs.
- Convergence maps provider/model/effort choices to Sandcastle provider
  factories.
- Convergence mounts CLI auth/config into the sandbox home.

Likely mounts:

- `~/.claude` -> `/home/agent/.claude`
- `~/.claude.json` -> `/home/agent/.claude.json`
- `~/.codex` -> `/home/agent/.codex`
- `~/.pi` -> `/home/agent/.pi` later

Fallback V1 smoke path:

- Sandcastle no-sandbox/host mode.
- Uses host provider binaries and auth.
- Weaker isolation, but useful to prove the library integration before Docker
  auth is solved.

Avoid in V1:

- Custom bridge from Sandcastle to Convergence's provider subprocesses.
- Running macOS provider binaries inside Linux Docker containers.
- Storing provider secrets in Convergence.

## Data Model

Implement backend tables in the existing SQLite layer.

### `workboard_tracker_sources`

Global app-level tracker source configuration. This is not project-scoped.

- `id`
- `type`: `linear` or `jira`
- `name`
- `enabled`
- `auth_json`: Linear/Jira source auth config. V1 may store explicit tokens
  locally; later versions should move toward OS keychain or connector-backed
  references.
- `sync_json`: source-specific filters and polling settings
- `last_sync_at`
- `last_sync_error`
- `created_at`
- `updated_at`

### `workboard_tracker_issues`

- `id`
- `source_id`
- `external_id`
- `external_key`
- `url`
- `title`
- `body`
- `labels_json`
- `status`
- `priority`
- `assignee`
- `updated_at_external`
- `raw_json`
- `last_seen_at`
- `created_at`
- `updated_at`

Unique key: `source_id + external_id`.

### `workboard_project_mappings`

- `id`
- `source_id`
- `name`
- `enabled`
- `priority`
- `matcher_json`
- `project_id`
- `workflow_policy`
- `sandbox_mode`
- `branch_prefix`
- `stage_defaults_json`
- `created_at`
- `updated_at`

### `workboard_candidates`

This can be a view-model at first, derived from tracker issues and mappings.
Persist later only if needed.

Fields:

- normalized tracker issue
- visibility/state label result
- mapping result
- readiness result
- recommended action

### `workboard_runs`

- `id`
- `project_id`
- `status`
- `workflow_policy`
- `sandbox_mode`
- `branch_strategy`
- `branch_name`
- `repo_path`
- `log_root`
- `current_stage_id`
- `progress_json`
- `error`
- `sandcastle_result_json`
- `started_at`
- `ended_at`
- `created_at`
- `updated_at`

Statuses:

- `queued`
- `starting`
- `running`
- `blocked`
- `review`
- `done`
- `failed`
- `stopping`
- `stopped`

### `workboard_run_issues`

- `run_id`
- `tracker_issue_id`
- `sort_order`
- `lane_status`
- `branch_name`
- `summary`
- `created_at`
- `updated_at`

### `workboard_stages`

- `id`
- `run_id`
- `role`: `sync`, `planner`, `implementer`, `reviewer`, `writeback`, `merger`
- `status`
- `provider_id`
- `model`
- `effort`
- `max_iterations`
- `iteration_count`
- `log_file_path`
- `commit_shas_json`
- `started_at`
- `ended_at`
- `error`
- `result_json`

### `workboard_events`

- `id`
- `run_id`
- `stage_id`
- `sequence`
- `type`
- `message`
- `payload_json`
- `created_at`

Event types:

- `lifecycle`
- `agent_text`
- `tool_call`
- `verification`
- `commit`
- `tracker_writeback`
- `error`

### `workboard_writebacks`

- `id`
- `run_id`
- `tracker_issue_id`
- `operation`
- `status`
- `external_update_id`
- `payload_json`
- `error`
- `created_at`
- `updated_at`

## Renderer/API Shape

Follow the repo's FSD-lite rules.

Backend:

- `electron/backend/workboard/types.ts`
- `electron/backend/workboard/repository.ts`
- `electron/backend/workboard/service.ts`
- `electron/backend/workboard/ipc.ts`
- `electron/backend/workboard/tracker/linear.provider.ts`
- `electron/backend/workboard/tracker/jira.provider.ts`
- `electron/backend/workboard/sandcastle/readiness.service.ts`
- `electron/backend/workboard/sandcastle/runner.service.ts`

Preload:

- add `window.electronAPI.workboard.*`

Renderer:

- `src/entities/workboard/workboard.types.ts`
- `src/entities/workboard/workboard.api.ts`
- `src/entities/workboard/workboard.model.ts`
- keep `src/widgets/ralph-task-dashboard/*` as the UI surface for now

Initial IPC methods:

- `workboard:getSnapshot`
- `workboard:syncSources`
- `workboard:listTrackerSources`
- `workboard:upsertTrackerSource`
- `workboard:listProjectMappings`
- `workboard:upsertProjectMapping`
- `workboard:checkProjectReadiness`
- `workboard:startRun`
- `workboard:stopRun`
- `workboard:getRunEvents`
- `workboard:onSnapshotUpdated`
- `workboard:onRunEvent`

The renderer should consume one `WorkboardSnapshot` so the UI can stay stable
while backend implementation deepens.

## State Machines

### Candidate State

```text
not-visible
  -> candidate
  -> ready
  -> running
  -> blocked
  -> review
  -> done
  -> failed
```

Candidate state is derived from tracker labels/status until Convergence starts
a run. Once a run starts, Convergence becomes the owner of state transitions
for that issue unless the user explicitly disables write-back.

### Run State

```text
queued
  -> starting
  -> running
  -> review
  -> done

starting/running
  -> blocked
  -> failed
  -> stopping
  -> stopped
```

`blocked` means the run preserved useful context and expects human decision.
`failed` means an unexpected technical failure or unrecoverable provider/sandbox
failure.

### Stage State

```text
waiting -> running -> done
waiting/running -> blocked
waiting/running -> failed
running -> stopping -> stopped
```

Progress bars should be derived from stage completion and known lifecycle
milestones, not token count.

## Phased Implementation

### Phase 0: Prototype And Terminology

Status: done enough to keep iterating.

Scope:

- Global Workboard entry point in the top app chrome.
- Mock UI that shows tracker sources, candidates, project mapping, readiness,
  active Sandcastle runs, stages, artifacts, and detail panel.
- Research and implementation docs captured.

Manual checks:

- Run the app.
- Confirm Agent Workboard is a global surface.
- Confirm terminology is Agent Workboard/Ralph loop/Sandcastle run.

### Phase 1: Workboard Foundation And Contracts

Status: implemented as a mock-backed contract checkpoint.

Goal: replace ad hoc mock data with real app contracts while still using a
mock backend provider.

Scope:

- Add shared backend/renderer workboard types.
- Add SQLite tables for tracker sources, mappings, issues, runs, stages,
  events, and write-backs.
- Add repository/service skeleton.
- Add IPC/preload workboard API.
- Move the current mock snapshot behind `workboard:getSnapshot`.
- Add renderer entity API/model for snapshot loading and live updates.
- Keep UI behavior visually unchanged.

Non-goals:

- No real Linear/Jira network calls.
- No Sandcastle execution.
- No tracker mutation.

Manual checks:

- Run app with an empty DB and see seeded/mock Workboard data.
- Restart app and confirm persisted settings/runs survive if seeded.
- Confirm current UI still renders via IPC data, not local component fixtures.
- Click "Sync trackers" and confirm the Workboard remains populated. In Phase
  1 this still calls the mock backend sync path; it should not contact Linear,
  Jira, or Sandcastle yet.

Tests:

- Repository CRUD tests for core tables.
- Pure mapping/state derivation tests.
- Renderer model test for snapshot load/error state.

### Phase 2: Read-Only Linear And Jira Sync

Status: implemented as read-only adapters plus IPC-configured sources. Source
configuration UI is intentionally deferred. Tracker credentials are global
Workboard source settings, not project settings.

Goal: real Linear and Jira issues can become Workboard candidates.

Scope:

- Implement `TrackerProvider` interface.
- Add Linear read-only provider.
- Add Jira read-only provider.
- Store tracker source settings.
- Support manual sync from the Workboard.
- Normalize issues into `workboard_tracker_issues`.
- Derive candidate state from `convergence-loop` plus state labels.
- Display sync status, last sync time, and sync errors.

Non-goals:

- No label/comment write-back.
- No Sandcastle execution.
- No GitHub Issues adapter.

Manual checks:

- Configure one Linear source and one Jira source through the Workboard IPC
  API or direct DB setup.
- Add `convergence-loop` + `loop-ready` to one issue in each tracker.
- Run sync.
- Verify both appear in the Workboard with correct source/key/title/labels.
- Remove `convergence-loop` and verify the issue disappears or becomes hidden
  after sync, depending on retention setting.

Tests:

- Provider normalization fixtures for Linear and Jira.
- Label-state derivation tests.
- Sync idempotency test: same issue updates existing row.

Implementation risk:

- Auth shape differs per tracker. Start with explicit source configuration that
  can later be replaced by connector/MCP-backed auth.

### Phase 3: Project Mapping

Status: implemented as persisted mappings plus snapshot grouping. Mapping UI is
still deferred; use IPC or direct DB setup for manual testing.

Goal: candidates are routed to Convergence projects deterministically.

Scope:

- Add mapping CRUD UI or minimal settings path.
- Support Linear team/project/label matching.
- Support Jira project/component/label/JQL-style matcher config.
- Support manual fallback labels like `cv-project-convergence`.
- Sort mappings by priority.
- Show mapped, needs mapping, and mapping conflict states.
- Group candidates by project in the Workboard.

Non-goals:

- No Sandcastle execution.
- No automatic issue creation from conversations yet.

Manual checks:

- Map Linear team `CONV` to the convergence project.
- Map Jira project/component to another local project.
- Verify candidate cards move into the correct project group.
- Disable a mapping and confirm affected issues become unmapped.
- Create two matching mappings and confirm priority/conflict behavior is clear.

Tests:

- Mapping matcher tests.
- Priority/conflict tests.
- Snapshot grouping tests.

### Phase 4: Sandcastle Readiness

Status: implemented as local filesystem/PATH/auth mount preflight checks.

Goal: the Workboard knows whether a mapped project can run a loop.

Scope:

- Add project readiness service.
- Check `.sandcastle/` exists.
- Check expected prompt/workflow files exist. Accept `run.ts`, `main.mts`, or
  `main.ts` as workflow entry files because current Sandcastle projects may use
  `run.ts`.
- Check Dockerfile exists when sandbox mode is Docker.
- Check Sandcastle package/import availability.
- Check Docker/Podman availability where configured.
- Check provider auth/config mount paths exist.
- Check project workflow policy is supported.
- Display readiness check results in project composer and detail panel.

Non-goals:

- Do not auto-edit `.sandcastle/` yet.
- Do not run full loops yet.

Manual checks:

- Open project without `.sandcastle/`; verify "Needs init".
- Run `sandcastle init` manually in terminal.
- Refresh readiness; verify next missing dependency is shown.
- Configure missing Claude/Codex auth mount; verify readable warning.

Tests:

- Readiness service tests with temporary fixture repos.
- Sandcastle file detection tests.
- Provider mount detection tests using fake home dirs.

### Phase 5: Sandcastle Library Smoke Run

Status: implemented as a first real Sandcastle `run()` bridge for one
`simple-loop` issue at a time. It persists runs, stages, events, branch/log
metadata, and streams `logging.onAgentStreamEvent` into the Workboard snapshot.
The current Sandcastle `run()` API accepts Docker/bind-mount style sandbox
providers; its exported `noSandbox()` provider is typed for interactive mode,
so the no-sandbox fallback remains a follow-up rather than part of this phase.

Goal: run one low-risk issue in one project and stream real progress.

Scope:

- Add Sandcastle runner service.
- Start with one workflow: `simple-loop`.
- Use explicit branch mode.
- Use deterministic branch and log paths.
- Pass issue metadata into prompt args/context.
- Persist run, stage, and event records.
- Use `logging.onAgentStreamEvent` for live event persistence.
- Surface branch, log path, commits, iterations, and result in UI.
- Add stop/abort wiring if Sandcastle exposes usable abort signal.

Non-goals:

- No tracker label mutation yet.
- No multi-issue runs.
- No reviewer stage unless trivial to include.

Manual checks:

- Pick one low-risk Linear issue mapped to a test repo.
- Start a run from the Workboard.
- Confirm a branch/worktree is created.
- Confirm `.sandcastle/logs/convergence/{run-id}/...` is written.
- Confirm live events appear in the detail panel.
- Confirm final commits/result are stored and visible.

Fallback check:

- If Docker subscription auth fails, use a Docker image/auth mount fix for the
  current implementation. A true no-sandbox run fallback needs either a
  Sandcastle `run()`-compatible no-sandbox provider or a separate host/worktree
  adapter.

Tests:

- Runner service unit tests with a fake Sandcastle adapter.
- Event ordering/persistence tests.
- Abort state transition test with fake runner.

### Phase 6: Tracker Comments And Label Write-Back

Goal: Convergence safely owns external issue state transitions.

Scope:

- Add Linear write-back provider.
- Add Jira write-back provider.
- Post comments on run start, block, failure, review, and done.
- Mutate state labels idempotently.
- Preserve unknown labels.
- Persist every write-back attempt.
- Retry failed write-back operations.
- Show write-back status in detail panel.

Non-goals:

- No PR creation yet.
- No GitHub Issues.

Manual checks:

- Start a run and verify `loop-running`.
- Complete smoke task and verify `loop-review` or `loop-done`.
- Force missing env/config and verify `loop-blocked`.
- Force provider failure and verify `loop-failed`.
- Restart Convergence mid-run/write-back and confirm duplicate comments are not
  posted.

Tests:

- Label transition tests.
- Idempotent comment/write-back tests.
- Provider fixture tests for Linear and Jira payloads.

### Phase 7: Sequential Reviewer Workflow

Goal: implement the first useful "deep loop" path: implementer then reviewer.

Scope:

- Add workflow policy `sequential-reviewer`.
- Use `createSandbox()` or equivalent Sandcastle primitive so implementer and
  reviewer share branch/worktree state.
- Store separate implementer and reviewer stages.
- Reviewer can return pass, requested changes, blocked, or failed.
- If reviewer requests changes, run another implementer iteration up to limit.
- Display review notes and requested changes in the detail panel.

Manual checks:

- Run one issue with implementer Claude and reviewer Codex.
- Confirm both stages appear separately.
- Confirm reviewer comments are visible.
- Confirm requested changes loop back to implementer.
- Confirm final state moves to review/done only after reviewer pass.

Tests:

- Workflow state-machine tests with fake Sandcastle adapter.
- Reviewer requested-changes loop test.
- Max reviewer cycles test.

### Phase 8: Multi-Issue Per-Project Runs

Goal: run several loop-ready issues for the same project from one Workboard
operation.

Scope:

- Add issue selection controls in run composer.
- Create one run group with multiple task lanes.
- Execute sequentially first with concurrency `1`.
- Keep each lane independently observable.
- Allow one lane failure without losing state for other lanes.
- Add per-lane branch/log/stage records.

Manual checks:

- Select two ready issues in the same project.
- Run sequentially.
- Confirm each issue gets its own branch/log/stage state.
- Confirm one failed issue does not erase the other issue's result.

Tests:

- Lane state transition tests.
- Sequential scheduler tests.
- Partial failure tests.

### Phase 9: Parallel Planner With Review

Goal: unlock the fuller dashboard shape: planner selects safe lanes, workers
run in parallel, reviewers verify, merger/handoff resolves results.

Scope:

- Add planner stage.
- Planner reads mapped ready issues for one project.
- Planner marks issues safe parallel, sequential, or blocked.
- Run independent implementer/reviewer pipelines concurrently with a
  concurrency limit.
- Add merge/handoff stage for completed branches.
- Detect merge conflicts and surface blocker state.

Manual checks:

- Prepare three ready issues: two independent, one likely conflicting.
- Confirm planner selects safe parallel work.
- Confirm two lanes run at the same time.
- Confirm reviewer stage follows implementer per lane.
- Confirm conflict becomes blocked with preserved branch/worktree.

Tests:

- Planner output parsing/validation tests.
- Concurrency limiter tests.
- Conflict/blocker state tests with fake git adapter.

### Phase 10: Project-Owned Workflow Editing

Goal: make `.sandcastle/` understandable and editable from Convergence without
hiding that it is project-owned.

Scope:

- Show `.sandcastle/` status in Project Settings and Workboard details.
- Open prompt files from the UI.
- Edit known prompt markdown files with confirmation.
- Preview prompt variables with selected issue metadata.
- Detect missing/drifted workflow files.
- Keep headless Sandcastle usage intact.

Manual checks:

- Edit `implement-prompt.md` from Convergence.
- Confirm file changes on disk.
- Run a loop and verify modified prompt is used.
- Run the project headlessly with its `.sandcastle/main.mts`.

Tests:

- Prompt variable preview tests.
- File drift detection tests.
- Guardrail tests for editing only known project files.

### Phase 11: Global Multi-Project Coordination

Goal: the global Workboard can launch independent per-project runs at the same
time.

Scope:

- Select issues across multiple mapped projects.
- Group planned runs by project.
- Start separate Sandcastle orchestration per project.
- Add global concurrency limits.
- Add provider subscription/resource throttling.
- Ensure stopping one project run does not stop another.

Manual checks:

- Start one Linear-backed personal repo issue and one Jira-backed work repo
  issue.
- Confirm separate project runs under one Workboard.
- Stop one run and confirm the other continues.

Tests:

- Global scheduler tests.
- Per-project stop isolation tests.
- Resource limit tests.

### Phase 12: GitHub Issues Adapter

Goal: support the Sandcastle/open-source workflow directly.

Scope:

- Add GitHub Issues read/write provider.
- Reuse the same labels, state model, mapping model, and write-back model.
- Support repo-to-project mapping as the natural default.

Manual checks:

- Add `convergence-loop` and `loop-ready` to a GitHub issue.
- Map repo to a Convergence project.
- Run the same smoke path as Linear/Jira.

### Phase 13: True Multi-Repo Tasks

Goal: one logical issue can coordinate changes across multiple repositories.

Scope:

- Model one external issue mapped to several projects.
- Create one parent run group with child project runs.
- Add cross-repo planning.
- Add approval gates before merge/PR.
- Add combined review and handoff summary.

Non-goal for earlier phases:

- Do not block the first Sandcastle integration on this.

## First Implementation Order

The next implementation should be:

1. **Phase 1**: workboard backend tables, service, IPC, renderer API/model, UI
   backed by snapshot from IPC.
2. **Phase 2**: read-only Linear and Jira sync.
3. **Phase 3**: mapping rules and grouping.
4. **Phase 4**: Sandcastle readiness checks.
5. **Phase 5**: one issue, one project, one Sandcastle smoke run.

This sequence gives a runnable checkpoint after every phase and avoids coupling
tracker integration to Sandcastle before either side has a stable contract.

## Feasibility Notes

This is feasible if we respect the boundaries:

- Sandcastle is repo-centric, so V1 runs per project/repo.
- Sandcastle library calls and `logging.onAgentStreamEvent` should give enough
  observability for the Workboard.
- `createSandbox()` should support implementer/reviewer chains.
- Parallel lanes are feasible, but Convergence must own scheduling and
  concurrency limits.
- Tracker sync/write-back is outside Sandcastle and must be built in
  Convergence.
- Provider subscription auth inside Docker is the largest early technical
  risk.
- Arbitrary user-authored `.mts` scripts are not dashboard-friendly; known
  policies should be productized first.

## Open Decisions

- Should tracker source auth use explicit tokens first, or try to reuse app/MCP
  connector auth where available?
- Should V1 store raw Sandcastle event payloads indefinitely or compact them
  after a run finishes?
- Should write-back move issues to `loop-review` by default, with `loop-done`
  only after human confirmation?
- Should Workboard runs create normal Convergence sessions for transcript
  compatibility, or remain a separate run transcript model?
- Should no-sandbox mode be allowed for all users or only as an explicit
  developer/advanced fallback?
