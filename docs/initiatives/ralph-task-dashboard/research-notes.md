# Ralph Task Dashboard Research Notes

## Purpose

This document captures the first research pass for bringing Ralph-style agent
loops into Convergence. It is a context anchor for future UI/UX prototyping and
implementation planning.

Implementation planning lives in
`docs/initiatives/ralph-task-dashboard/implementation-plan.md`.

The feature is expected to become a new product surface, not a small extension
of the existing session view. It overlaps with Initiatives, but it is more
operational: a dashboard for real tasks being worked by one or more agents,
possibly across multiple providers and workspaces.

## What A Ralph Loop Is

A Ralph loop is a repeated fresh-agent invocation where progress survives
outside the LLM context window.

The basic shape:

```text
while not done:
  run agent with the same prompt
  agent reads current files, git history, progress notes, and tests
  agent makes progress
  agent persists state through files, commits, or progress markers
  controller checks whether to stop or run again
```

The important idea is not "run forever". The important idea is state
externalization:

- the prompt can stay stable
- the agent context is reset every iteration
- the codebase changes between iterations
- progress is visible through files, git history, tests, task state, and
  explicit completion markers

Good stop conditions include completion markers, no remaining actionable work,
tests passing, max iterations reached, explicit user stop, or blocked state.

Reference: <https://wiggum.dev/concepts/the-loop/>

## Sandcastle Findings

Local project inspected: `/Users/marckraw/Projects/OpenSource/sandcastle`

Sandcastle is the stronger architecture reference. It is a TypeScript toolkit
for running AI coding agents inside sandboxes and worktrees.

Useful concepts:

- **Agent provider**: provider-neutral command construction and stream parsing
  for Claude Code, Codex, Pi, OpenCode, etc.
- **Sandbox provider**: Docker, Podman, Vercel/isolated, no-sandbox.
- **Branch strategy**: direct head, temporary branch merged back, or named
  branch.
- **Iteration loop**: max iterations, completion signal, idle timeout, prompt
  preprocessing, hooks, logs, session capture.
- **Reusable sandbox**: `createSandbox()` allows implementer/reviewer chains to
  share one branch and environment.
- **Templates**:
  - `simple-loop`: one agent works through issues sequentially.
  - `sequential-reviewer`: implementer then reviewer.
  - `parallel-planner`: planner selects unblocked work, implementers run in
    parallel, merger integrates branches.
  - `parallel-planner-with-review`: implementer and reviewer per branch before
    merge.

What Convergence should learn from Sandcastle:

- Treat the loop as orchestration over explicit iterations.
- Keep provider execution abstract.
- Use worktrees or stronger sandboxes for parallel work.
- Make lifecycle hooks and verification commands first-class.
- Separate planner, implementer, reviewer, and merger roles.
- Preserve logs and per-iteration results for review.

What Convergence should not copy directly:

- Sandcastle is script/CLI-first. Convergence needs a persistent visual
  dashboard and a product-level task model.
- Its templates put orchestration in user-authored scripts. Convergence should
  own orchestration as backend state plus renderer UI.

## Ralphy Findings

Local project inspected: `/Users/marckraw/Projects/Private/ralphy`

Ralphy is the stronger workflow/product reference. It implements a
Claude-specific Ralph loop integrated with Linear/Jira.

Useful concepts:

- `ralph-candidate`, `ralph-ready`, `ralph-enriched`, and PR feedback labels.
- Candidate/ready queues before execution.
- AI enrichment of issues before work starts.
- `progress.md` as durable task memory.
- `.ralphy/history/{issue}/run.json` and `output.log` as run history.
- Watch mode that polls for ready issues.
- AI prioritization of the next issue when processing a batch.
- Start/completion comments back into the issue tracker.
- Graceful stop behavior: finish current issue, then stop.

What Convergence should learn from Ralphy:

- A task dashboard needs task lifecycle, not just sessions.
- Enrichment and readiness are part of the product.
- Progress files/history are useful even when transcript exists.
- Queue and watch modes are important for unattended operation.
- Completion should update the external work item and produce review context.

What Convergence should not copy directly:

- Ralphy runs directly on the current working tree, which is not enough for
  parallel agents.
- It is Claude-specific, while Convergence already has Claude Code and Codex
  provider abstractions.
- It commits after the loop, while Convergence should capture each turn,
  iteration, branch, diff, and output explicitly.

## 2026 Pattern

The state of the art has moved beyond a plain bash loop.

Observed patterns:

- Worktree isolation is the standard primitive for parallel local agents.
- Stronger sandboxing or containerized profiles matter for untrusted workloads.
- Planner/worker/reviewer/merger roles are common for larger tasks.
- Parallelism is valuable only when tasks are well-scoped and low-conflict.
- Agent dashboards increasingly combine worktrees, running agents, PR/CI state,
  review comments, Linear/GitHub tasks, and service health.
- Cloud agents run in ephemeral environments and make branch changes before PR
  review.
- Claude Code agent teams and Anthropic multiagent APIs emphasize independent
  context windows, task lists, and coordination overhead.
- Security matters: autonomous agents reading untrusted content and writing
  files need current provider versions, clear boundaries, and review surfaces.

Useful references:

- Ralph loop docs: <https://wiggum.dev/concepts/the-loop/>
- Claude Code subagents: <https://code.claude.com/docs/en/sub-agents>
- Claude Code agent teams: <https://code.claude.com/docs/en/agent-teams>
- Anthropic managed multiagent sessions:
  <https://platform.claude.com/docs/en/managed-agents/multi-agent>
- GitHub Copilot cloud agent:
  <https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent>
- GitHub third-party agents:
  <https://docs.github.com/en/copilot/concepts/agents/about-third-party-agents>
- OpenAI Codex GitHub integration:
  <https://docs.github.com/en/copilot/concepts/agents/openai-codex>
- webmux dashboard reference: <https://webmux.dev/>
- Claude Code sandbox escape advisory:
  <https://raxe.ai/labs/advisories/RAXE-2026-059>

## Convergence Fit

Convergence already has many required primitives:

- provider-neutral sessions
- Claude Code and Codex adapters
- worktree-backed workspaces
- turn capture and file-change capture
- task progress observability
- project context injection
- attachments and skills
- Initiatives, Attempts, Outputs, and AI synthesis

Therefore Ralph loops should be an orchestration layer over existing
Convergence concepts, not a separate CLI runtime.

Likely backend concepts:

- **Task run**: durable execution of a real task through one or more agent
  sessions.
- **Task item**: issue/spec/work item selected from a queue or created manually.
- **Loop iteration**: one fresh provider session/turn attempting progress.
- **Task workspace**: the worktree or sandbox used for the task.
- **Task policy**: max iterations, provider/model, verification commands,
  completion signals, review mode, parallelism limits.
- **Task role**: planner, implementer, reviewer, merger, hardener, docs.
- **Task output**: branch, commit range, PR, spec, docs, release note, or
  blocked finding.

Likely product distinction from Initiatives:

- **Initiatives** are durable delivery context: what are we trying to change,
  what have we learned, which attempts and outputs matter?
- **Ralph task dashboard** is operational execution: what tasks are queued,
  running, blocked, reviewing, done, and which agents/workspaces are acting
  right now?

They should connect. A Ralph task can belong to an Initiative, and completed
task outputs can become Initiative outputs. But the dashboard should not feel
like the Initiative workboard.

## UI And UX Hypothesis

The next phase should be UI prototyping, because the visual model will clarify
the domain model.

The new surface should likely feel like an agent operations board:

- task queue on one side
- active task lanes or rows in the center
- each active task shows assigned agents, provider, model, workspace/branch,
  current iteration, activity, verification state, and attention state
- task detail panel shows prompt, progress file, transcript excerpts, changed
  files, commits, verification logs, and stop/retry/continue controls
- completed tasks show outputs and review handoff
- parallel task batches show planner output and branch merge status

Important UI questions to answer through prototypes:

- Is the primary unit a task card, a worktree lane, or an agent lane?
- How much of the existing session transcript belongs on this screen?
- How do we show many simultaneous agents without becoming a terminal
  multiplexer?
- How do we distinguish "needs you", "blocked", "reviewing", and "done"?
- How should tasks attach to Initiatives without making the dashboard too
  heavy?
- What should the user see when a task loops through multiple fresh iterations?
- Should review/merge agents be shown as separate tasks or phases inside one
  task?

## Recommended First Product Slice

Start with a prototype-only renderer surface before implementing orchestration.

Prototype scope:

1. A new Ralph task dashboard view using the current design system.
2. Static/mock data for:
   - queued tasks
   - running tasks
   - multiple providers
   - multiple agents per task
   - iteration progress
   - blocked/review/done states
3. Task detail panel with:
   - progress notes
   - agent timeline
   - changed files
   - verification status
   - outputs
4. A visual relationship to Initiatives, but not dependent on them.

Only after the UI shape feels right should we lock the backend schema.

## Exploration On April 30, 2026

This pass clarified a major architectural decision: Convergence should use
Sandcastle as the Ralph loop execution engine instead of recreating the loop
runtime from scratch.

The canonical task queue should live in issue trackers, not only in
Convergence. The expected human workflow is:

1. Explore a feature or bug in normal Convergence sessions.
2. Produce a spec, PRD, or Initiative plan.
3. Ask an agent, skill, or MCP workflow to materialize granular tickets in
   Linear, Jira, or GitHub Issues.
4. Mark selected tickets with tracker-specific "ready for loop" labels/status.
5. Let the Agent Workboard sync eligible tickets and launch Sandcastle runs.

This means Convergence does not need to be the only place tasks are authored.
Its job is to be the orchestration and observability layer over durable issue
tracker work items.

Likely tracker model:

- **GitHub Issues**: Matt Pocock/Sandcastle-style source queue, useful for open
  source and repo-local work.
- **Linear**: personal/product backlog source, likely the first-class personal
  workflow.
- **Jira**: work/company backlog source, likely needed for professional
  projects.

Convergence should support all three through source adapters. Each adapter
should normalize external tickets into the same internal task shape:

- external source type and URL
- external issue key/number
- project/repo mapping
- title/body/acceptance criteria
- labels/status/priority
- readiness marker
- comments/progress write-back capabilities

## Deeper Sandcastle Notes

Sandcastle is a TypeScript library for orchestrating AI coding agents in
sandboxes and git worktrees. Its core API is `run()`, plus `createSandbox()`
for reusable implement-review chains.

The important internals for Convergence:

- `run()` resolves the repo cwd, prompt, branch strategy, env, logging, and
  sandbox factory, then calls `orchestrate()`.
- `orchestrate()` runs a bounded iteration loop. Each iteration starts a
  sandbox lifecycle, preprocesses the prompt, invokes the agent, captures
  stream output/tool calls, checks completion signals, captures session usage
  when supported, collects commits, and decides whether to continue.
- `createSandbox()` creates one explicit branch/worktree/sandbox and lets
  callers run multiple agents inside it. This is the right primitive for
  implementer then reviewer, or implementer-reviewer-hardener chains.
- `WorktreeManager` creates managed worktrees under
  `.sandcastle/worktrees/`, names temp branches as `sandcastle/...`, reuses
  managed worktrees when safe, prunes stale metadata, and preserves dirty
  worktrees for review instead of deleting them.
- `SandboxLifecycle` configures git identity, runs host/sandbox hooks, captures
  base HEAD, runs work, syncs isolated sandbox changes back, merges temp
  branches when needed, collects commit SHAs, and preserves failed/dirty state.
- `AgentProvider` abstracts provider-specific command construction and stream
  parsing. Built-in providers include Claude Code, Codex, Pi, and OpenCode.
- Provider streams are normalized into text, tool calls, result text, and
  optional session IDs. Claude Code can also capture session JSONL and token
  usage.
- File logging writes human-readable run status, agent text, and tool calls to
  `.sandcastle/logs/*.log`.
- `logging.onAgentStreamEvent` can forward each normalized text/tool event to a
  caller-controlled observability system while the file log is still written.

Sandcastle's loop stopping model:

- `maxIterations` limits the number of fresh agent invocations.
- `completionSignal` defaults to `<promise>COMPLETE</promise>`.
- Idle timeout fails an iteration when the agent stops producing output.
- Abort signals can stop a run while preserving useful worktree state.
- Commit count and branch state are available after a run, but Sandcastle does
  not decide product-level task completion by itself.

Sandcastle's branch modes:

- **head**: bind-mount the current working directory and write directly to it.
- **merge-to-head**: create a temporary worktree branch, run there, then merge
  back to the host branch.
- **branch**: create or reuse an explicit branch and leave commits there.

For Convergence, the safest default should be explicit branch mode per external
task: `sandcastle/{source}-{issue-key}-{slug}` or a similar deterministic
branch name. Parallel work should never default to head mode.

Sandcastle templates map cleanly to product presets:

- `simple-loop`: one worker pulls tasks and processes them sequentially.
- `sequential-reviewer`: implementer then reviewer.
- `parallel-planner`: planner selects unblocked issues, workers run in
  parallel, merger integrates.
- `parallel-planner-with-review`: planner, parallel implementer/reviewer
  pipelines, then merger.

These templates are currently script-first. Convergence should not expose them
as raw scripts in the main UX. Instead, Convergence should model them as
workboard policies/presets and generate the Sandcastle calls behind the scenes.

## Sandcastle Observability Plan

The Agent Workboard should not scrape terminal output as its primary data
source. It should combine structured run state from Convergence with
Sandcastle's native outputs:

- Store the Sandcastle `RunResult`: iterations, completion signal, stdout,
  commits, branch, log file path, and preserved worktree path.
- Use `logging.path` to write a deterministic log file per task/stage/run.
- Use `logging.onAgentStreamEvent` to stream normalized text/tool events into
  Convergence task progress state in real time.
- Tail/read the log file for an expandable "raw log" view.
- Record lifecycle milestones in Convergence: queued, sandbox starting,
  dependencies installing, agent started, tool call, text output, agent
  stopped, commits collected, review started, blocked, completed.
- Derive progress bars from known stage steps rather than pretending token
  stream length equals progress.

Suggested UI mapping:

- **Progress bar**: stage checklist progress: synced, sandbox ready, running,
  verified, reviewed, write-back done.
- **Live log preview**: last few Sandcastle file-log lines and recent
  `onAgentStreamEvent` text/tool events.
- **Iteration counter**: `RunResult.iterations.length` and configured
  `maxIterations`.
- **Commit/output panel**: `RunResult.commits`, branch, PR/link, preserved
  worktree path.
- **Provider panel**: Sandcastle agent provider, model, effort, sandbox
  provider, branch strategy.
- **Attention states**: idle timeout, failed hook, missing completion signal,
  no commits, dirty preserved worktree, review requested changes, merge
  conflict, human input needed.

Convergence should own the durable task/run schema, tracker sync, UI state, and
stage policy. Sandcastle should own sandbox execution, provider invocation,
iteration mechanics, commit collection, and raw logs.

## Sandcastle Sandbox And Provider Boundary

Convergence already has first-class provider integrations for Claude Code,
Codex, and Pi. They are subscription-first: Convergence detects local binaries,
spawns them as subprocesses, inherits the user's environment, and relies on each
CLI's own login/auth store. This is intentional. Convergence does not own OAuth
or API-key auth for these providers.

Current Convergence provider behavior:

- Claude Code sessions spawn the detected `claude` binary with streaming JSON
  flags, `--dangerously-skip-permissions`, optional `--resume`, model, and
  effort. One-shot calls use `claude -p --output-format json`.
- Codex sessions spawn `codex app-server` and speak JSON-RPC. One-shot calls
  use `codex exec`.
- Pi follows the same broad pattern: the user logs in through the CLI, and
  Convergence spawns the authenticated binary.

Sandcastle also has provider wrappers for Claude Code, Codex, Pi, and OpenCode,
but its wrappers run inside the selected sandbox via `sandbox.exec()`. With
Docker/Podman, that means the provider CLI command runs inside Linux in the
container, not in the Electron main process and not through Convergence's
existing provider classes.

This creates an important boundary:

- Normal Convergence sessions should continue using Convergence provider
  classes.
- Ralph/Workboard loop execution should use Sandcastle provider classes unless
  there is a strong reason to build a custom bridge.
- The Workboard should reuse Convergence's provider registry for discovery,
  model/effort selection, defaults, and status display, but Sandcastle will
  still invoke its own provider command inside the sandbox.

The subscription requirement is therefore an environment problem, not a model
API problem. To use monthly subscriptions inside Sandcastle Docker runs:

- The Docker image must install Linux-compatible provider CLIs (`claude`,
  `codex`, and optionally `pi`). The macOS host binary path detected by
  Convergence cannot be mounted and executed inside a Linux container.
- The container must see the provider auth/config files at the paths expected
  by the CLI under its sandbox home, usually `/home/agent`.
- Likely mounts:
  - `~/.claude` to `/home/agent/.claude`
  - `~/.claude.json` to `/home/agent/.claude.json` when present
  - `~/.codex` to `/home/agent/.codex`
  - `~/.pi` to `/home/agent/.pi` if Pi becomes part of loop execution
- Auth mounts probably need to be read-write if a CLI refreshes tokens or writes
  session state. Read-only mounts are safer but may fail for token refresh or
  session capture.
- Sandcastle's Claude Code provider captures session JSONL back to the host
  under `~/.claude/projects/...`; this intersects with mounted Claude auth and
  session storage, so we should smoke-test this path carefully.

There are three possible integration strategies:

1. **Preferred V1: Sandcastle-native providers with mounted subscription auth.**
   Convergence launches Sandcastle with selected provider/model/effort, Docker
   image, branch policy, deterministic log path, and auth/config mounts. This
   keeps Sandcastle intact and avoids reimplementing its loop kernel.

2. **Fallback: host/no-sandbox execution.** Sandcastle can run against a
   worktree without Docker-style isolation, which lets it use the exact host
   binaries and auth that Convergence already detects. This is simpler for
   subscription compatibility but weaker for parallel/untrusted automation.

3. **Advanced bridge: custom Sandcastle provider or sandbox provider backed by
   Convergence.** In theory, we could expose Convergence provider execution as a
   local command or JSON-RPC bridge and make Sandcastle call that. In practice,
   Sandcastle's `AgentProvider` expects a command executed inside the sandbox,
   so this would require a custom bridge process, networking, auth boundaries,
   and event translation. It would duplicate complexity and should not be V1.

The main product implication: there will be two provider execution paths, but
they should share configuration and UI language.

- Convergence provider registry remains the source of truth for what the app
  knows about providers, models, efforts, and user defaults.
- Sandcastle remains the source of truth for loop execution events, commits,
  branches, and logs.
- The Workboard adapter maps Convergence provider choices to Sandcastle
  provider factories.
- Provider auth remains owned by the provider CLI. Convergence should surface
  preflight checks and setup hints, not store credentials.

Open implementation checks for the Sandcastle integration:

- Verify Claude Code subscription login works in the Docker image with mounted
  `~/.claude` and `~/.claude.json`.
- Verify Codex subscription login works in the Docker image with mounted
  `~/.codex`.
- Verify whether provider CLIs mutate auth/session files during long loop runs,
  and whether read-only mounts are viable.
- Verify model/effort option names between Convergence provider descriptors and
  Sandcastle provider factories.
- Verify Sandcastle's Codex `codex exec --json` path gives enough streaming
  signal compared with Convergence's `codex app-server` session path.
- Decide whether the Workboard should store Sandcastle stdout/log events as a
  separate run transcript or convert them into normal Convergence conversation
  items.

## Project-Owned Sandcastle Workflows

Sandcastle expects each repository to have a `.sandcastle/` directory. Running
`sandcastle init` scaffolds project-local workflow files such as:

- `main.mts`: orchestration script for the selected template.
- prompt files like `prompt.md`, `implement-prompt.md`,
  `review-prompt.md`, `plan-prompt.md`, and `merge-prompt.md`.
- `Dockerfile`: sandbox image definition with the selected provider CLI and
  backlog-manager tools installed.
- `.env` and `.env.example`: declared environment variables for the sandbox.
- `.gitignore`: ignores generated logs and worktrees.

The selected template matters because `main.mts` is just TypeScript. It can
orchestrate one task, many sequential tasks, planner-worker-reviewer pipelines,
or parallel branches via `Promise.allSettled()` and multiple
`createSandbox()` calls. Therefore multiple running tasks do not require
multiple `.mts` files. One workflow process can own many task lanes.

Recommended Convergence interpretation:

- Treat `.sandcastle/` as a **project-owned workflow pack**, not as hidden app
  state.
- Treat `.mts` files as **workflow presets/scripts** that can still be run
  headlessly outside Convergence.
- Treat prompt markdown files as editable instructions, similar in spirit to
  skills: project-local, versionable, and understandable by humans.
- Let Convergence offer setup/editing assistance for these files, but do not
  make them opaque generated blobs.

The preferred V1 should be hybrid:

1. The project is initialized with `.sandcastle/` using Sandcastle's normal
   init flow or a Convergence-assisted setup flow.
2. Users can still run the project workflow in a terminal with `npx tsx
.sandcastle/main.mts`.
3. Convergence does **not** blindly shell out to arbitrary `main.mts` for the
   primary Workboard experience.
4. Convergence imports/understands the project workflow configuration,
   prompts, provider choice, branch policy, tracker commands, and Dockerfile.
5. Convergence launches Sandcastle as a library from Electron backend for
   controlled Workboard runs.
6. The Workboard records one durable Convergence run, then maps Sandcastle
   stages, tasks, branches, logs, and stream events into the dashboard.

This gives us both properties we want:

- The project remains Sandcastle-native and can run without Convergence.
- Convergence gets enough control to show the real Agent Workboard UI, stop and
  resume runs, stream progress, attach runs to issue trackers, and persist
  state.

Suggested Workboard mapping:

- **Workboard run**: one Convergence-owned orchestration invocation.
- **Workflow**: selected project `.sandcastle` preset, such as simple loop,
  sequential reviewer, or parallel planner with review.
- **Task lane**: one external issue/branch/sandbox inside the workflow.
- **Stage**: planner, implementer, reviewer, hardener, merger, or write-back.
- **Sandcastle run**: one `run()` or `sandbox.run()` call inside a stage.
- **Agent event**: streamed text/tool event from Sandcastle
  `onAgentStreamEvent`.
- **Raw log**: deterministic `.sandcastle/logs/...` file path for inspection.

For the first implementation, avoid trying to support arbitrary user-authored
workflow logic in the dashboard. Start with a small set of known policies that
map onto Sandcastle templates:

- Sequential reviewer: safest first real loop.
- Parallel planner with review: target workflow for multiple simultaneous task
  lanes.
- Simple loop: useful smoke-test and headless compatibility mode.

Open design questions:

- Should Convergence generate `.sandcastle/workflows/*.mts` files in addition
  to Sandcastle's default `.sandcastle/main.mts`, or should it keep one main
  script and model policies in Convergence?
- Should Workboard edits modify markdown prompt files directly, or maintain
  Convergence-side overrides that are passed as `promptArgs`?
- How much drift can Convergence tolerate when a user hand-edits `main.mts`?
- Should project setup validate that Dockerfile, provider CLI, auth mounts,
  tracker CLI/MCP, and prompts are compatible before enabling "Start loop"?

## Updated Product Flow

The likely first durable workflow:

1. User explores and produces a spec or Initiative plan in normal sessions.
2. A skill/MCP workflow creates loop-ready Linear/Jira/GitHub issues from that
   plan.
3. The issue tracker becomes the canonical task queue.
4. Agent Workboard syncs issues matching configured labels/statuses.
5. User selects tasks and chooses a loop policy: fast, deep, review-heavy, or
   parallel.
6. Convergence launches Sandcastle with explicit branch/worktree policy.
7. Sandcastle streams file logs and structured text/tool events back to
   Convergence.
8. Convergence shows progress, logs, commits, branch, reviewer state, and
   blockers.
9. Convergence writes back issue comments/status/labels with progress,
   completion, branch/PR links, and review results.

This keeps the boundary clean:

- Issue trackers are the task queue.
- Convergence is the control plane and memory/observability surface.
- Sandcastle is the execution kernel.
- Provider CLIs are interchangeable workers under Sandcastle.

## Open Decisions

- Name: "Ralph", "Loops", "Task Runs", "Agent Workboard", or something else.
- Whether the dashboard is global or project-scoped first.
- Whether task source V1 is Linear, Jira, GitHub Issues, or a minimal adapter
  abstraction with one tracker implemented first.
- Whether V1 loops reuse normal Convergence sessions or create a special
  session subtype.
- Whether each iteration creates a new session or a turn-like child record under
  one task run.
- How much sandboxing V1 needs beyond existing worktrees.
- Where verification commands live: project settings, task policy, or both.
- How merge/review agents should be represented.
- How much of Sandcastle's script-template flexibility should become product
  presets versus advanced user-authored configuration.
- Whether Convergence should create tracker tickets itself, or mainly provide
  skills/MCP workflows that create tickets from exploration sessions.
