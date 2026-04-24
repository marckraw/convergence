# Agent-Native Initiatives Product Spec

## Objective

Introduce **Initiatives** as the top-level work-tracking object in
Convergence.

An Initiative is a durable delivery container for agent-driven work. It tracks
the journey from rough idea through exploration, implementation, review, pull
requests, and final outcome across one or more projects.

The goal is not to recreate Jira inside Convergence. The goal is to support a
new workflow where engineers start from agent exploration, then curate the
useful parts into stable product and implementation context.

## Product Motivation

Before agent-native development, teams often had to write tickets, user
stories, acceptance criteria, and sprint plans before implementation could
start. That made sense when human implementation was the expensive first step.

In Convergence, starting an agent exploration can be cheaper than fully
specifying a ticket. A rough prompt can produce a useful proof of concept,
implementation sketch, failed attempt, or list of constraints. The product
should treat those conversations as meaningful work rather than disposable
chat history.

The app needs a way to answer:

- What are we trying to change or learn?
- Which agent sessions have worked on this?
- What did those sessions produce?
- Which decisions are stable?
- Which questions are still open?
- What outputs are expected or already created?
- What should the next agent do?

## Core Product Decisions

1. The top-level object is called an **Initiative**.
2. Sessions become **Attempts** when linked to an Initiative.
3. An Initiative can be tiny or large.
4. AI may suggest summaries, decisions, questions, and next actions, but the
   user decides what becomes stable Initiative state.
5. A session linked to an Initiative should show an Initiative side panel so
   the user can see the current agent attempt and the larger delivery context
   at the same time.
6. Users should be able to create an Initiative manually, create one from a
   session, or attach a session to an existing Initiative.
7. The first AI-powered action should be **Synthesize current understanding
   from linked sessions**.
8. Outputs are first-class. An Initiative usually ends in one or more pull
   requests, but may also produce branches, specs, docs, migration notes,
   releases, or other artifacts.
9. Initiatives are global, not project-owned. They must be able to link
   sessions from multiple projects from V1, because multi-project delivery is
   one of the main reasons this feature exists.
10. An Initiative has a list of Attempts. One Attempt may be marked primary,
    usually the first or seed Attempt, but the Initiative is not centered on a
    single session.

## Terminology

### Initiative

The durable container for a unit of agent-driven work.

An Initiative may represent:

- a small UI tweak completed by one session and one pull request
- a feature requiring exploration, implementation, review, and hardening
- a multi-repository effort that produces several pull requests
- a parked idea with useful research but no current implementation path

### Attempt

A session linked to an Initiative.

Attempts are the working units where agents explore, implement, review, or
harden the Initiative. Existing Convergence sessions remain provider-neutral;
linking a session to an Initiative gives that session a role in a larger work
story.

Possible attempt roles:

- `seed`: the original session that started the Initiative
- `exploration`: a session investigating options or feasibility
- `implementation`: a session making the intended code changes
- `review`: a session reviewing output from another attempt
- `hardening`: a session focused on tests, edge cases, refactors, or polish
- `docs`: a session producing specs, docs, migration notes, or release notes

### Current Understanding

The stable curated description of what the user currently believes about the
Initiative.

The UI should use **Current understanding** for this section in V1. It
intentionally avoids making "brief" the central product object. The central
object is the Initiative; current understanding is one important section
inside it.

### Suggested Update

An AI-generated proposal that has not been accepted as stable Initiative
state.

Examples:

- suggested decision
- suggested open question
- suggested status change
- suggested next action
- suggested summary update

Suggested updates must be reviewable and rejectable. They should not silently
rewrite the Initiative's stable state.

In V1, suggested updates can be transient preview results from an AI action:
the user runs synthesis, reviews the suggestions, accepts or edits useful
parts, and only accepted changes are persisted. A future version may store
unaccepted suggestions durably as a suggestion inbox or activity artifact.

### Output

A concrete artifact the Initiative is expected to produce or has produced.

Examples:

- pull request
- branch
- commit range
- release
- spec
- documentation
- migration note
- changelog entry
- design artifact
- external issue link

## Scale Model

Initiatives must scale without becoming heavy.

### Tiny Initiative

```text
Initiative: Add copy button to session title

Attempts:
  - one Codex implementation session

Outputs:
  - one pull request in convergence
```

### Large Initiative

```text
Initiative: Agent-native work tracking

Attempts:
  - initial product exploration
  - UX planning
  - backend schema design
  - renderer implementation
  - review agent
  - hardening agent
  - documentation agent

Outputs:
  - spec updates
  - pull request in convergence
  - release notes
  - follow-up initiatives
```

The UI should not force the large shape onto the tiny case. A user should be
able to create or attach an Initiative with minimal ceremony, then add
structure only when the work needs it.

## Stable vs Unstable State

The Initiative has two kinds of information.

### Stable State

Stable state is user-curated. It represents what the user has accepted as
true or operationally useful.

Examples:

- title
- status
- current understanding
- accepted decisions
- accepted constraints
- open questions intentionally tracked by the user
- linked outputs
- intended next action

### Unstable State

Unstable state is generated or discovered during agent work. It may be useful,
but should not automatically become truth.

Examples:

- raw transcript details
- draft findings
- unreviewed agent summaries
- hypotheses
- suggested decisions
- suggested questions
- suggested next actions

The product should make promotion explicit:

```text
Suggested decision:
Use SQLite FTS for prompt history search.

[Accept] [Edit] [Reject]
```

## Status And Attention

Initiative status should track the delivery journey. Attention should track
what currently needs human focus.

This avoids creating too many status values for things that are really flags.

### Proposed Statuses

- `exploring`: the Initiative is still discovering the right shape
- `planned`: enough direction exists to implement intentionally
- `implementing`: agents are making the intended changes
- `reviewing`: output exists and needs review or feedback
- `ready-to-merge`: the expected pull request output is ready
- `merged`: the pull request output has been merged
- `released`: the Initiative has reached its release outcome
- `parked`: useful context exists, but the work is not currently active
- `discarded`: the work was intentionally abandoned

For V1, this can be simplified to:

- `exploring`
- `implementing`
- `reviewing`
- `done`
- `parked`

### Proposed Attention Flags

- `none`
- `needs-you`
- `needs-decision`
- `blocked`
- `stale`

These should not require perfect automation in V1. User-set attention is
acceptable. Later, Convergence can suggest attention from linked session
states, failed attempts, unresolved questions, or inactive initiatives.

## UI Model

### Workboard

Initiatives need a global surface, but it should not become a heavyweight
issue tracker.

The Workboard should help users scan:

- active Initiatives
- Initiatives needing a decision
- Initiatives with running or waiting sessions
- Initiatives ready for review
- parked or completed Initiatives

The board does not need to mimic Jira columns. The useful axis is knowledge
and delivery maturity, not only task execution.

The Workboard is different from the Initiative side panel:

- **Workboard**: the global place to scan, filter, open, and create
  Initiatives across projects.
- **Initiative side panel**: a contextual panel shown next to a linked
  session, focused on the Initiative behind the current agent attempt.
- **Initiative detail view**: the full inspection and editing surface for one
  Initiative.

V1 should include a Workboard, but it should stay lightweight. It can start as
a list or compact board of Initiatives rather than a full workflow system.

### Session View With Initiative Panel

When a session is linked to an Initiative, the session view should become a
focused attempt inside a larger context.

The sidebar should continue to behave as normal project, workspace, and
session navigation. Initiative membership does not need a special sidebar
representation in V1. The selected session determines whether the main content
area renders as a standalone conversation or as a focused attempt with
Initiative context.

```text
main content area
  | conversation or terminal attempt
  | Initiative context panel
```

The conversation or terminal remains the primary working surface, but an
Initiative context panel appears on the right when the selected session is
linked to an Initiative.

The panel should be dense and operational:

- Initiative title and status
- current understanding
- linked attempts
- open questions
- accepted decisions
- suggested updates
- outputs
- next actions

The purpose is to keep the user aware of the larger work story while an agent
is working inside one session.

### Initiative Detail View

The Initiative detail view is the full inspection surface.

Suggested sections:

- Overview
- Current understanding
- Attempts
- Decisions
- Open questions
- Outputs
- Suggested updates
- Activity log

## Creation And Linking Flows

### Create Initiative Manually

The user creates an Initiative from a command, board action, or project
surface. Minimal required input should be title only.

Optional fields:

- current understanding
- status
- initial output target

### Create Initiative From Session

The user can create an Initiative from an existing session.

The session becomes the seed attempt. The app can offer to synthesize the
initial current understanding from that session.

### Attach Session To Existing Initiative

The user can attach the active session to an existing Initiative.

This is important because users should not need to know up front whether a
rough exploration will become durable work.

### Suggested Initiative Prompt

The app may surface a lightweight suggestion:

```text
This session looks like project work.
Attach it to an Initiative?
```

This should be advisory and dismissible, not a blocking workflow.

## AI-Assisted Behaviors

AI should help organize initiative context, but should not silently mutate
stable state.

### V1 AI Action

**Synthesize current understanding from linked sessions**

Input:

- linked session transcripts
- session summaries
- attempts and roles
- changed files, when available
- existing Initiative state

Output:

- proposed current understanding
- proposed decisions
- proposed open questions
- proposed next action
- proposed outputs, if detected

The result should enter the UI as suggested updates. The user can accept,
edit, or reject each part.

### Future AI Actions

- compare attempts and recommend a path
- generate implementation plan from current understanding
- generate review prompt for a new agent
- detect likely outputs from branch/PR state
- summarize changes since last accepted Initiative update
- identify stale or blocked Initiatives

## Outputs

Outputs are first-class because the practical end of most Initiatives is a
merged change.

V1 should support outputs as records attached directly to Initiatives.

Users can create outputs manually:

- kind
- label
- URL or local identifier
- status

Convergence can also support semi-automatic output discovery. For example, a
refresh action can inspect repositories from linked session projects and
suggest newly created pull requests or branches as outputs. The user should
confirm suggested outputs before they become stable Initiative state.

Outputs are important because the Initiative should remain useful after the
work is done. A user should be able to reopen a completed Initiative and see
the pull requests, branches, docs, specs, migration notes, or important files
that represented the result of the work.

Possible output statuses:

- `planned`
- `in-progress`
- `ready`
- `merged`
- `released`
- `abandoned`

Future versions can detect outputs automatically from GitHub, local branches,
commits, or release metadata.

## Candidate Data Model

This is directional, not final implementation shape.

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

interface InitiativeDecision {
  id: string
  initiativeId: string
  text: string
  evidenceSessionId: string | null
  evidenceTurnId: string | null
  createdAt: string
}

interface InitiativeQuestion {
  id: string
  initiativeId: string
  text: string
  status: 'open' | 'answered' | 'deferred'
  createdAt: string
  updatedAt: string
}

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

interface InitiativeOutput {
  id: string
  initiativeId: string
  kind: InitiativeOutputKind
  label: string
  value: string
  sourceSessionId: string | null
  status:
    | 'planned'
    | 'in-progress'
    | 'ready'
    | 'merged'
    | 'released'
    | 'abandoned'
  createdAt: string
  updatedAt: string
}
```

## V1 Scope

V1 should prove the workflow without overbuilding the system.

### In Scope

- create Initiative
- edit Initiative title
- edit current understanding
- set Initiative status
- link and unlink sessions as attempts
- mark one linked attempt as primary
- create Initiative from active session
- attach active session to existing Initiative
- show Initiative panel in linked session view
- show lightweight Workboard for global Initiative navigation
- show Initiative detail view
- add manual outputs
- discover and suggest outputs from linked session repositories where feasible
- synthesize current understanding from linked sessions as suggested updates

### Out Of Scope

- fully automatic PR detection without user confirmation
- fully automatic output lifecycle tracking
- GitHub integration
- release automation
- complex workflow rules
- sprint planning
- assignments
- multi-user permissions
- external issue tracker sync
- automatic truth promotion from AI output
- perfect automated status or attention detection
- advanced archived-session behavior

## Resolved Product Questions

1. The UI term is **Current understanding** for V1.
2. Initiatives are global objects. They do not belong to a single project.
3. Sessions from multiple projects must be linkable to one Initiative from V1.
4. Outputs should be attached directly to Initiatives in V1.
5. Outputs can be created manually, and pull requests or branches may be
   suggested through repository refresh where feasible.
6. Initiatives have a list of attempts. One attempt may be marked primary, but
   the model is not single-session-centric.
7. V1 should include a lightweight Workboard plus the session side panel and
   detail view.

## Clarifications And Remaining Questions

### Suggested Update Durability

Transient suggested updates exist only inside the synthesis result or preview
flow. If the user accepts or edits a suggestion, the accepted result becomes
stable persisted Initiative state. If the user closes the preview, the
unaccepted suggestions can disappear.

Durable suggested updates would be persisted as pending suggestions even if
the user closes the preview. That could be useful later, but it creates more
state to manage. V1 should prefer transient suggestions unless user testing
shows that losing unaccepted suggestions is painful.

### Archived Sessions

Archived session behavior is intentionally deferred. An archived session that
is already linked as an Attempt should remain part of the Initiative history,
but the broader semantics of session archive need to be improved separately.

V1 Initiative behavior should not depend on final archived-session semantics.

### Initiative Archiving

Initiative archiving can be modeled as status in a later phase. The likely
future behavior is a status such as `archived` rather than a separate hidden
archive lifecycle. For V1, use `done`, `parked`, or `discarded` as the
available completion states.

## Implementation Notes

Implementation should follow the existing Convergence architecture:

- renderer entity slice: `src/entities/initiative`
- renderer feature slices for create/link/synthesize flows
- widget slice for Initiative panel or Workboard composition
- backend service: `electron/backend/initiative`
- preload and renderer API wrappers for all IPC
- SQLite persistence in the existing database module
- FSD-lite import boundaries through public `index.ts` files

Avoid introducing legacy flat roots. Keep session linking provider-neutral and
independent of Claude Code, Codex, or shell provider details.
