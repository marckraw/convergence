# Convergence v2 Boundaries

## Objective

Convergence v2 is the extraction target for turning Convergence from a
desktop-only application into a remotely reachable agent work system.

The current Convergence desktop app remains the incubator and reference
implementation. New work in this repo should keep contracts, domain models, and
runtime boundaries extractable so they can later move into a Convergence v2
monorepo without rewriting the product.

The intended product outcome is simple:

- desktop, iPad, iPhone, web, scripts, and automations can all drive the same
  Convergence capabilities
- users can start, inspect, steer, approve, and review agent work from wherever
  they are
- external systems can invoke Convergence through stable APIs and receive
  durable status/events back

## Non-Goals

This document is not a rewrite plan and not a commitment to immediately split
the current app into services.

Do not extract services just because the future system may be cloud-capable.
Convergence should first define stable contracts inside the current app, then
expose those contracts, then move selected execution behind remote hosts.

Initial non-goals:

- replacing the current Electron desktop app
- making cloud execution mandatory
- introducing queue/scheduler services before there is operational pressure
- making mobile depend on desktop internals or Electron IPC details
- treating provider CLIs as safe multi-tenant execution without additional
  isolation work

## System Vocabulary

### Client

A user-facing app or API caller.

Examples:

- Convergence desktop
- Convergence mobile
- Convergence web
- REST/API-token automation
- webhook consumer

Clients do not own execution. They create commands, render snapshots, subscribe
to events, and answer attention requests.

### App API

The stable command/query contract that clients use to operate Convergence.

In the current desktop repo this may be implemented behind Electron IPC. In v2
the same contract should be usable over HTTP/WebSocket/SSE by mobile, web, and
external callers.

The App API should be shaped around product concepts rather than UI details:

- projects
- workspaces
- sessions
- turns
- messages
- attachments
- attention requests
- artifacts
- providers
- pipeline runs
- execution hosts

### Execution Host

The place where agent work actually runs.

An execution host owns the privileged runtime surface:

- repository or workspace checkout
- provider CLI process
- provider credentials available to that process
- filesystem writes
- command execution
- attachment materialization
- runtime logs
- event emission

Initial host types:

- `local`: embedded in Convergence desktop
- `remote`: headless runtime service inspired by `agents-daemon`

The important distinction is that clients control work, but execution hosts
perform work.

### Cloud Control Plane

The cloud service that coordinates users, devices, API tokens, routing, and
remote execution hosts.

The control plane should eventually own:

- user and device identity
- project registry
- execution host registry
- API tokens
- pipeline definitions
- webhook subscriptions
- routing from client commands to the correct execution host
- quotas, concurrency limits, and audit logs

The control plane should not directly become a provider adapter. Provider
processes should run inside execution hosts.

### Runtime Event Log

The durable timeline of everything important that happens to a session or
pipeline run.

Remote clients require more than request/response APIs. They need to reconnect,
replay missed updates, and rebuild UI state from a snapshot plus events.

The event log should represent:

- status changes
- message deltas
- finalized messages
- activity start/update/complete
- thinking updates
- tool calls and tool results
- attention request opened/resolved
- context-window updates
- artifacts created/updated
- errors
- done/finalized events

The current desktop app can continue to emit IPC patch events, but new backend
work should preserve enough information to become a durable event stream.

### Provider Adapter

The boundary between Convergence and a concrete agent provider.

Provider adapters should normalize provider-specific behavior into the shared
session model:

- Claude Code
- Codex
- Pi
- future providers

Adapters should expose capabilities rather than forcing caller-side provider
checks:

- streaming support
- resumability
- follow-up support
- steer/interrupt support
- approval support
- structured input request support
- attachment kinds
- models and effort levels
- permission/sandbox modes

### Pipeline

A named automation that can create or coordinate one or more sessions.

Pipelines should be callable from clients and external API callers. They may
eventually be scheduled, queued, or triggered by webhooks, but queue/scheduler
infrastructure should remain an implementation detail until it needs a separate
deployable service.

### Companion Gateway

A gateway that lets a remote client view/control a running desktop Convergence
instance.

This is distinct from cloud execution:

- companion gateway: desktop remains source of truth and execution host
- remote execution host: headless service owns execution

Both should use the same App API concepts where possible.

## Target Monorepo Shape

Convergence v2 may live in a separate monorepo when extraction pressure becomes
real. A likely shape:

```txt
apps/
  desktop/          Electron client plus local execution host
  mobile/           React Native iPhone/iPad client
  web/              Browser client, later

services/
  cloud-api/        Control plane: auth, routing, tokens, pipelines, webhooks
  runtime-host/     Headless execution host, evolved from agents-daemon ideas

packages/
  domain/           Project, workspace, session, event, provider types
  api-contracts/    Shared request/response/event schemas
  client-sdk/       Typed client used by apps and external callers
  event-log/        Event definitions, replay rules, snapshot helpers
  providers/        Provider adapter contracts and shared serializers
  workspace/        Git/worktree/project-copy primitives
```

This is a target boundary map, not a requirement to create every package at
once.

## Current Repo Extraction Rules

When adding or changing current Convergence code, prefer shapes that can move
into the v2 boundaries later.

### 1. Keep IPC as a transport, not the domain model

Electron IPC handlers should call backend services whose inputs and outputs look
like future App API contracts.

Avoid adding logic that only makes sense because the caller is a renderer
component.

### 2. Preserve domain-first types

Core types should describe Convergence concepts, not UI widgets.

Prefer:

- `Session`
- `ConversationItem`
- `AttentionRequest`
- `ExecutionHost`
- `ProviderCapability`
- `PipelineRun`

Avoid leaking:

- component state
- tab selection
- drawer state
- transient view-model names

### 3. Make session changes event-shaped

If a session can change, the change should be expressible as an event.

The renderer may consume patches today, but backend services should preserve
enough structure to later support:

- replay
- reconnect
- multiple clients watching the same session
- webhook delivery
- mobile background/foreground transitions

### 4. Isolate provider details

Provider-specific parsing, command construction, permissions, and attachment
serialization should stay behind provider adapter modules.

Do not let renderer features or shared session services branch directly on
provider-specific implementation details unless the branch is driven by a
declared capability.

### 5. Treat execution as host-owned

Anything that touches provider processes, workspaces, filesystem writes, or
credentials belongs to an execution-host boundary.

The current desktop host can be local and embedded. Future remote hosts should
be able to implement the same conceptual contract.

### 6. Keep queue and scheduler internal first

Queueing and scheduling are capabilities of the control plane, not necessarily
separate services.

Only split them into standalone services after there is a concrete reason:

- independent scaling
- separate failure domain
- durable delayed execution requirements
- multiple control-plane instances coordinating work

## Candidate App API Surface

The exact transport is undecided. The conceptual API should include commands
and queries like:

```txt
GET  /projects
POST /projects
GET  /projects/:projectId/workspaces
POST /workspaces

GET  /sessions
POST /sessions
GET  /sessions/:sessionId
POST /sessions/:sessionId/messages
POST /sessions/:sessionId/respond
POST /sessions/:sessionId/stop
GET  /sessions/:sessionId/events
GET  /sessions/:sessionId/stream

GET  /providers
GET  /providers/status

GET  /execution-hosts
POST /execution-hosts/:hostId/health-check

GET  /pipelines
POST /pipelines/:pipelineId/runs
GET  /pipeline-runs/:runId
GET  /pipeline-runs/:runId/stream
```

REST-style routes are useful for commands and snapshots. Live Convergence
experiences also require SSE or WebSocket event streams.

## Relationship To Existing References

### Current Convergence

Current Convergence is the source of product truth. It already contains the
richest version of:

- project/workspace/session UX
- attention states
- provider-aware composer behavior
- normalized conversation rendering
- local provider runtime services

New implementation should keep this code extractable rather than reimplementing
it prematurely elsewhere.

### agents-daemon

`agents-daemon` is a useful reference for a future remote execution host.

Borrowable ideas:

- authenticated HTTP command API
- headless provider execution
- cached bare clone plus per-session worktree
- provider adapter contract
- persisted session/message/activity/request tables
- replayable SSE stream with `Last-Event-ID`
- signed webhooks and retry
- provider readiness and metadata endpoints
- optional commit/push/PR automation

Do not copy directly without reworking:

- GitHub-only source model
- bearer-token-only trust model
- daemon-global provider credentials
- weak multi-tenant isolation
- default unsafe provider permissions
- lack of Convergence project/workspace/attention concepts

### T3 Code

T3 Code is a useful reference for remote environments and pairing.

Borrowable ideas:

- saved environments
- local and remote runtime distinction
- private-network access through Tailscale/SSH-style mechanisms
- environment availability and reconnect states
- multiple clients connected to different runtime environments

Convergence should still keep its own domain model centered on agent work
sessions rather than adopting T3 Code wholesale.

## Phased Direction

### Phase 1: Internal Contract Discipline

Keep building current Convergence, but shape backend services and renderer API
wrappers as if they were future App API calls.

Exit criteria:

- session create/send/respond/stop paths are clearly service-backed
- provider capability checks are declarative
- session state changes can be mapped to event types

### Phase 2: Durable Event Backbone

Make session event semantics explicit enough for replay and reconnect.

Exit criteria:

- event types are documented
- snapshots can be rebuilt or validated from persisted state
- multiple clients can theoretically subscribe without relying on renderer-local
  state

### Phase 3: Remote Companion Gateway

Expose selected desktop App API capabilities over a private remote gateway.

Exit criteria:

- mobile can connect to desktop
- desktop remains source of truth
- remote client can list sessions, inspect conversation, send followups, and
  answer attention requests

### Phase 4: Remote Execution Host

Build or adapt a headless runtime host inspired by `agents-daemon`.

Exit criteria:

- host can report metadata and provider readiness
- host can provision a workspace
- host can run a provider session and stream normalized events
- host can accept followups/responses
- host can return artifacts and final status

### Phase 5: Cloud Control Plane

Introduce a cloud API that routes clients to execution hosts and owns external
integrations.

Exit criteria:

- mobile can operate without direct desktop LAN access when a remote host exists
- external callers can trigger pipelines through API tokens
- webhooks can receive durable status updates
- execution host selection is explicit and inspectable

## Design Principle

Convergence v2 should not be a rewrite cave.

The practical path is to keep shipping the current desktop product while making
each new backend boundary more extractable. When the v2 monorepo begins, it
should receive known contracts and proven runtime behavior, not speculative
service names.
