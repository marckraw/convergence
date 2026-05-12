# Chat Spaces Product Spec

## Objective

Add **Spaces** to the Chat surface so related global chat Sessions are grouped
under a durable context container. A Space gives the user a place to keep the
purpose, memory, sources, artifacts, and multiple agent attempts for one topic
or effort.

Spaces are the chat-side equivalent of "something above one Session." They are
not code Workspaces and they are not Projects. V1 focuses on global chat
Sessions only; later versions may let Spaces reference code Projects,
Workspaces, and project-bound Sessions.

## Product Motivation

The current Chat surface has a flat list of global Sessions. That works for
one-off chats, but it breaks down once a topic has multiple attempts, context
files, accepted decisions, or reusable memory.

A Space should answer:

- What is this broader effort or topic?
- Which chat Sessions have worked on it?
- What sources should attempts in this Space know about?
- What stable memory or instructions should guide future attempts?
- What artifacts or outputs has the Space produced?
- What is the current understanding before the next attempt starts?

## Existing Repo Grounding

Convergence already has most of the domain skeleton:

- `Session.contextKind = 'project' | 'global'` separates project Sessions from
  global chat Sessions.
- `src/widgets/chat-surface` renders global Sessions without code-specific
  panels.
- `src/widgets/sidebar/global-chat-session-list.presentational.tsx` currently
  shows a flat chat list.
- `initiatives`, `initiative_attempts`, and `initiative_outputs` already model
  a global container, linked Sessions, and outputs.
- `InitiativeSessionLinkDialogContainer` can link both project and global
  Sessions.

V1 should reuse this direction but rename the product and implementation to
Space where practical.

## Core Product Decisions

1. **Space is inside Chat, not a third app surface.** `Code` and `Chat` remain
   the app-level surfaces. Spaces are a navigation and context layer inside
   Chat.
2. **Space is the user-facing replacement for Initiative.** Initiative was a
   work-tracking name; Space is broader and fits non-code workflows.
3. **Attempts are Sessions linked to a Space.** UI may call them Chats in the
   main tab, but the domain keeps Attempt as the role-bearing relationship.
4. **Loose chats remain valid.** Users can start an ungrouped chat and later
   move it into a Space.
5. **Space context is explicit.** Brief, memory, instructions, sources, and
   previous-attempt summaries are available to new attempts, but provider-visible
   inclusion is shown before send.
6. **Space files are local files.** The database tracks metadata, while sources,
   memory documents, artifacts, and scratch files can live under an app-owned
   Space directory.
7. **Project and Workspace semantics stay unchanged.** Space does not take over
   repository or worktree responsibility.

## Terminology

### Space

A durable context container for related chat work.

Examples:

- `gc-agent`
- `Google Road`
- `IRF defining`
- `Podatki w szwajcarii`
- `Storyblok component research`

### Attempt

A Session linked to a Space. Attempts are independent provider conversations
that share access to the Space context when the user includes it.

The UI can label the attempt list as **Chats** for familiarity.

### Brief

The stable current understanding of the Space. This is user-curated and should
not be silently rewritten by AI.

### Memory

Durable facts, rules, preferences, and instructions that can be reused across
future attempts in the Space. Some memory may also be stored as markdown files
so it can be inspected or reused outside Convergence.

### Source

A user-added or generated input file/reference for the Space. Sources are
stable inputs, not conversation logs.

### Artifact

A promoted output of the Space, such as a generated file, spec, markdown note,
image, PR reference, decision record, exported data file, or other durable
result.

## Navigation Model

The Chat sidebar should support:

```text
New chat
Search

Spaces
  gc-agent
  Google Road
  IRF defining

Ungrouped chats
  Quick one-off model test

Archived
```

Clicking a Space selects the Space and opens the Space home in the main Chat
surface. Expanding a Space in the sidebar may reveal its Attempts for quick
navigation, but the first-click behavior is Space home.

## Space Home

The Space home is a first-class Chat view, not a dialog.

Recommended structure:

```text
Space title                              actions
Short description / current purpose

Composer: New attempt in this Space

Tabs:
  Chats
  Sources
  Memory
  Artifacts
  Brief
```

### Chats Tab

- Shows Attempts/Sessions linked to the Space.
- Offers "New attempt in this Space".
- Can move an existing ungrouped chat into the Space.
- Opens a selected Attempt into the normal conversation transcript.

### Sources Tab

- Lists Space sources backed by files or external references.
- V1 can start with file metadata and app-owned storage paths.
- Future phases can add indexing, extraction, and source-specific provider
  inclusion controls.

### Memory Tab

- Shows Space memory and instructions.
- Memory is explicit provider context, not hidden behavior.
- V1 may store a simple markdown memory document and instructions text.

### Artifacts Tab

- Lists promoted durable outputs.
- Existing Initiative Outputs can map to Artifacts.
- V1 should allow manual artifact records and filesystem-backed artifacts.

### Brief Tab

- Shows and edits current understanding.
- Can later include accepted decisions, open questions, constraints, and next
  action.

## Attempt Conversation View

Opening an Attempt uses the existing reusable Session conversation surface. It
should stay free of code-only panels unless the Session is project-bound in a
future phase.

The Attempt view can expose a Space context panel or header affordance:

- Space title
- included context summary
- quick access to Sources, Memory, Artifacts, Brief

## Context Policy

Context exists at three levels:

```text
Global context: app-wide preferences and memory
Space context: brief, memory, instructions, selected sources, artifacts
Session context: one-attempt instruction and explicit attachments
```

Before starting a new Space attempt, the composer should eventually show which
context will be sent:

```text
Context for this attempt:
[x] Global memory
[x] Space brief
[x] Space instructions
[x] Selected sources
[ ] Previous attempts summary
```

V1 can start with a simpler version, but it must not silently inject hidden
Space context.

## Filesystem Model

Each Space gets an app-owned local root:

```text
{userData}/spaces/{spaceId}/
  sources/
  memory/
  artifacts/
  attempts/{sessionId}/
  scratch/
```

Rules:

- Conversation transcript rows stay in SQLite.
- Source, memory, and artifact files can live on disk.
- Database rows store metadata and paths.
- Provider working directory for a Space attempt can later become either the
  Space root or `attempts/{sessionId}`.
- V1 should create the root and define storage contracts before deeply using
  every folder.

## Data Model Direction

Rename the Initiative domain to Space:

```text
initiatives              -> spaces
initiative_attempts      -> space_attempts
initiative_outputs       -> space_artifacts
Initiative               -> Space
InitiativeAttempt        -> SpaceAttempt
InitiativeOutput         -> SpaceArtifact
currentUnderstanding     -> brief
```

The rename can happen as an implementation phase. Since existing Initiative data
is not critical, a simple migration path is acceptable, but the app should not
silently lose data unless the migration phase explicitly decides to reset dev
data.

## Out Of Scope For Chat Spaces V1

- Space links to code Projects.
- Space-owned code Workspaces or worktrees.
- Automatic context injection without preview.
- Full semantic memory synthesis.
- Cross-device sync.
- Multi-provider delegation trees.
- Rich source indexing/search.
- Artifact versioning.

## Success Criteria

1. User can create a Space from Chat.
2. User can select a Space from the Chat sidebar and see a first-class Space
   home.
3. User can start a new global chat attempt inside a Space.
4. User can see attempts grouped under the Space and reopen them.
5. Existing ungrouped global chats still work.
6. Project, Workspace, and Code surface behavior does not regress.
7. Space brief/memory/source/artifact architecture is documented and ready for
   incremental implementation.
