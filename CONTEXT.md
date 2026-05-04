# Convergence Context

Convergence is a UI-first desktop app for managing AI agent work across local codebases. This context records product language for the whole Convergence product so future changes share one domain model instead of relying on scattered planning documents.

## Language

### Work Organization

**Initiative**:
A durable unit of agent-driven work that can span Projects, Sessions, and deliverable outputs.
_Avoid_: Ticket, task, epic

**Project**:
A product codebase context that provides repository roots, settings, Workspaces, and provider-visible context for agent work.
_Avoid_: Repo

**Workspace**:
An isolated mutable working copy for a Project, normally a git worktree, where Sessions can change files without colliding with other work.
_Avoid_: App workspace, layout workspace, repository

**Worktree**:
The current physical Git-backed implementation of a Workspace.
_Avoid_: Workspace domain object, Project copy

**Removed Worktree**:
A Workspace whose physical Worktree directory has been removed from disk while Convergence preserves Workspace and Session history.
_Avoid_: Deleted Workspace, archived Session

**Repository Root**:
A local Git repository path attached to a Project.
_Avoid_: Project, Workspace

**Branch**:
An external Git branch ref used by a Workspace, Pull Request, or branch Output.
_Avoid_: Workspace, Workspace Branch object

**Base Branch**:
The Git branch used as the starting point for creating a Workspace or as the target branch for a Pull Request.
_Avoid_: Project default, Workspace

**Attempt**:
A Session understood as part of an Initiative's work history and delivery story.
_Avoid_: Linked session, run, try

**Primary Attempt**:
The Attempt selected as the Initiative's canonical work thread or main delivery path.
_Avoid_: First Attempt, latest Attempt, winning Session

**Attempt Role**:
The role an Attempt plays in an Initiative's work story, such as Seed, Exploration, Implementation, Review, Hardening, or Docs.
_Avoid_: Session Status, Initiative Status, provider role

**Seed Attempt**:
An Attempt Role for a Session that contributed the originating context or starting point for an Initiative.
_Avoid_: Primary Attempt, first Session

**Output**:
A concrete result, delivery artifact, or external reference expected from or produced by an Initiative.
_Avoid_: Artifact, result

**Output Kind**:
The category of an Output, such as Pull Request, Branch, Commit Range, Release, Spec, Documentation, Migration Note, External Issue, or Other.
_Avoid_: Artifact type, file type

**Output Source**:
The Attempt associated with producing, discovering, or justifying an Output.
_Avoid_: Owner, assignee, Session link

**Release**:
A deliverable Output representing a published version, release notes, or deployment milestone produced by an Initiative.
_Avoid_: App Update, generic update

**Spec Output**:
An Output that records intended behavior, constraints, or implementation direction for an Initiative.
_Avoid_: Documentation Output, Migration Note Output

**Documentation Output**:
An Output that explains completed or stable product, technical, or operational knowledge to future readers.
_Avoid_: Spec Output, Migration Note Output

**Migration Note Output**:
An Output that records transition steps, compatibility notes, rollout concerns, or cleanup requirements.
_Avoid_: Documentation Output, Spec Output

**External Issue Output**:
An Output that references work tracked outside Convergence, such as a GitHub issue, Linear issue, or other external tracker item.
_Avoid_: Pull Request, Product Feedback, first-class tracker sync

**App Release**:
A published Convergence app version.
_Avoid_: Initiative Release Output, App Update

**Pull Request**:
An external code review artifact for changes produced in a Workspace.
_Avoid_: Output record, branch

**Workspace Pull Request**:
Convergence's cached lookup of the Pull Request associated with a Workspace.
_Avoid_: Initiative Output, Pull Request itself

**Current Understanding**:
The user-curated stable narrative of an Initiative, including what is believed, what direction is being taken, and what future Attempts should respect.
_Avoid_: Summary, brief, notes

**Suggested Update**:
A provider-generated proposal to change an Initiative's stable state before the user accepts it.
_Avoid_: Auto-update, generated truth, draft state

**Suggested Update Part**:
A reviewable part of a Suggested Update, such as proposed Current Understanding text, decisions, open questions, next action, or proposed Outputs.
_Avoid_: Stable Initiative state, separate domain object

**App Update**:
Convergence's own software update flow, including checking, downloading, and installing a newer app version.
_Avoid_: Release Output, Suggested Update

**Release Notes**:
Bundled or external notes describing changes in an App Release.
_Avoid_: What's New surface, Initiative Current Understanding

**Ready To Merge**:
An Initiative Status indicating the Initiative's intended code delivery is prepared for merge.
_Avoid_: Pull Request status, Output Status

**Merged**:
An Initiative Status indicating the Initiative's intended merge-stage delivery is complete.
_Avoid_: Output Status, Pull Request state

**Released**:
An Initiative Status indicating the Initiative's intended release-stage delivery is complete.
_Avoid_: App Release, Output Status

### Human Focus And Lifecycle

**Status**:
A lifecycle state that describes where an Initiative, Session, Output, or related object currently is.
_Avoid_: Attention, health

**Archive**:
The act of removing a Session or Workspace from active working surfaces while preserving its history and metadata.
_Avoid_: Delete, complete

**Attention**:
A human-focus signal that indicates something needs user awareness or action.
_Avoid_: Status, notification

**Attention Reason**:
The object-specific reason why an item currently has Attention.
_Avoid_: Status, surface label

**Session Attention Reason**:
A Session-specific Attention Reason such as needing input, needing approval, finished, or failed.
_Avoid_: Initiative Attention Reason, Session Status

**Initiative Attention Reason**:
An Initiative-specific Attention Reason such as needing a decision, being blocked, or becoming stale.
_Avoid_: Session Attention Reason, Initiative Status

**Blocked**:
An Initiative Attention Reason indicating progress is prevented and human awareness or action is needed.
_Avoid_: Initiative Status, Parked

**Stale**:
An Initiative Attention Reason indicating the Initiative has not been reconciled with recent Attempts, Outputs, or project reality and needs human review.
_Avoid_: Status, automatic age label

**Activity**:
The ephemeral runtime signal of what a Session is doing right now.
_Avoid_: Status, Attention

**Notification**:
A user-facing delivery event that surfaces something Convergence wants the user to notice.
_Avoid_: Attention source of truth, Status

**Notification Channel**:
A delivery route for a Notification, such as Toast, System Notification, Dock Badge, Dock Bounce, Sound, or Inline Pulse.
_Avoid_: Attention state, Notification event

**Attention Dismissal**:
A user-local dismissal of one current Attention instance for a work item, valid only while that item remains at the same update point.
_Avoid_: Clearing Attention, Needs You state, Status change

**Snooze**:
A user action that creates an Attention Dismissal for active Attention such as waiting for input or approval.
_Avoid_: Acknowledge, clear status

**Acknowledge**:
A user action that creates an Attention Dismissal for terminal review Attention such as finished or failed work.
_Avoid_: Snooze, Archive, complete

### Product Surfaces And Insights

**Needs You**:
A user-facing surface that gathers Sessions, Initiatives, or other work items with Attention requiring user awareness or action.
_Avoid_: Attention state, inbox

**Waiting on You**:
A Needs You section label for Sessions that need input or approval.
_Avoid_: Attention state, Status

**Needs Review**:
A Needs You section label for Sessions that finished or failed and need human review or acknowledgement.
_Avoid_: Turn Review, Status

**Command Center**:
A global action and search surface for navigating and initiating work across Convergence.
_Avoid_: Command model, palette state

**Local Analytics**:
Local-only usage insight for the user derived from stored Convergence work data.
_Avoid_: Product telemetry, remote analytics

**Insights**:
The App Settings surface that presents Local Analytics and Work Profile information to the user.
_Avoid_: Local Analytics data model, product telemetry

**Work Profile**:
A provider-generated interpretation of Local Analytics for the user's own reflection.
_Avoid_: Initiative Output, product telemetry

**Work Profile Snapshot**:
A persisted generated Work Profile for a selected Local Analytics range.
_Avoid_: Current Understanding, Initiative Output

**Product Feedback**:
User-submitted feedback or feature requests sent from Convergence to Convergence Cloud.
_Avoid_: Local Analytics, Turn feedback, provider telemetry

**App Settings**:
User-level Convergence preferences that apply across Projects, such as default Provider, Model, Effort, notifications, updates, debug logging, and Local Analytics controls.
_Avoid_: Project Settings, active Session configuration

**Project Settings**:
Preferences scoped to one Project, such as Workspace creation behavior and Project Context Items.
_Avoid_: App Settings, Session Defaults

**Session Defaults**:
The App Settings subset used to prefill new Agent Sessions, mainly Provider, Model, and Effort.
_Avoid_: Active Session settings, Project Settings

### Provider Runtime

**Provider**:
An execution backend that can run a Session through its own integration mechanics.
_Avoid_: Model, agent

**Shell Provider**:
A non-conversational Provider that runs Terminal Sessions.
_Avoid_: Terminal provider, shell session

**Model**:
A provider-specific AI model option selected for a Session or provider-powered operation.
_Avoid_: Provider, backend

**Effort**:
A provider/model-specific reasoning effort option selected for a provider-powered operation or Agent Session.
_Avoid_: App Settings, Status, Activity

**Provider Capability**:
A declared behavior or support level exposed by a Provider.
_Avoid_: Feature flag, provider check

**Provider Availability**:
Whether Convergence can find and use a Provider runtime in the current app environment.
_Avoid_: Session Status, Provider Status surface

**Provider Update**:
Maintenance of an external Provider package or binary, such as checking or updating a Codex, Claude Code, or Pi CLI install.
_Avoid_: App Update, Suggested Update

**Provider Status**:
The user-facing report surface that combines Provider Availability, version, install information, and Provider Update information.
_Avoid_: Provider Availability signal, Session Status

**Provider Debug Log**:
A diagnostic record of raw or near-raw Provider interaction used for troubleshooting.
_Avoid_: Conversation, Transcript, Task Progress

**Provider Continuation**:
Provider-native state that lets Convergence resume the same provider-side conversation, thread, or session for an existing Agent Session.
_Avoid_: Session Fork, Conversation, provider context window

**Continuation Token**:
An opaque provider identifier persisted by Convergence to support Provider Continuation.
_Avoid_: Conversation Item, Session Fork id, user-visible session id

**Continuation Recovery**:
The fallback path when Provider Continuation state is missing or stale and Convergence starts fresh while preserving the Convergence Session history.
_Avoid_: Session Fork, transcript reset

**Task Progress**:
Observable progress for a provider-powered or backend task that is not itself a Conversation Item.
_Avoid_: Status, Attention, activity

**Attachment Capability**:
A Provider Capability that declares which Attachment kinds and sizes a Provider can accept.
_Avoid_: Upload support, file support

**Skill**:
A provider-discoverable capability package that a user can select for a Turn.
_Avoid_: Tool, prompt snippet, command

**Skill Catalog**:
The provider-specific list of Skills Convergence can discover for the active Project.
_Avoid_: Tool list, MCP Server list

**Skill Scope**:
Where a Skill comes from or is visible, such as user, project, plugin, system, product, or settings scope.
_Avoid_: MCP Server Scope, Project Context

**Skill Selection**:
The user's explicit choice to include one or more Skills in a Turn.
_Avoid_: Skill Invocation, Provider Capability

**Skill Invocation**:
The provider-specific act of passing or activating selected Skills during a Turn.
_Avoid_: Skill Selection, Tool call

**Tool**:
A callable capability available to an agent during a Session.
_Avoid_: Skill, MCP server

**MCP Server**:
An external tool provider made available to a Provider through the Model Context Protocol.
_Avoid_: Skill, tool

**MCP Server Scope**:
Where an MCP Server configuration comes from and where it is visible, currently Global or Project.
_Avoid_: Project Context, Skill Scope, Provider Availability

### Sessions And Conversation

**Session**:
An execution attempt by an agent or terminal, rooted in a Project or Workspace, with summary state and an ordered conversation.
_Avoid_: Chat, run

**Agent Session**:
A user-facing Session run by an AI agent Provider.
_Avoid_: Conversation session, chat

**Terminal Session**:
A user-facing Session whose primary work surface is a terminal rather than an agent conversation.
_Avoid_: Shell session, terminal tab

**Session Fork**:
A new Session derived from an existing Session's Conversation lineage.
_Avoid_: Git branch, Workspace fork

**Full Conversation Fork**:
A Session Fork seeded from the parent Conversation.
_Avoid_: Provider Continuation, transcript UI copy

**Structured Summary Fork**:
A Session Fork seeded from an editable provider-generated summary of decisions, facts, artifacts, questions, and next steps.
_Avoid_: Current Understanding, automatic Initiative update

**Fork Summary**:
An editable provider-generated seed for a Structured Summary Fork, containing selected context such as decisions, facts, artifacts, questions, and next steps from the parent Session.
_Avoid_: Session Summary, Current Understanding

**Session Intent**:
The user's creation-time choice of what kind of Session to start.
_Avoid_: Session type, provider choice

**Terminal Layout**:
The split-pane and tab arrangement for a terminal surface.
_Avoid_: Pane tree, terminal state

**Primary Surface**:
The main work surface shown for a Session.
_Avoid_: Session kind, provider kind

**Session Summary**:
The lightweight state used by list, attention, and navigation surfaces without loading conversation content.
_Avoid_: Session row, session metadata

**Conversation**:
The ordered set of Conversation Items that belongs to a Session.
_Avoid_: Transcript, chat log

**Transcript**:
The visible UI surface that renders a Session's Conversation.
_Avoid_: Conversation storage, transcript blob

**Conversation Item**:
A first-class ordered unit in a session conversation, such as a user message, assistant message, tool call, tool result, approval request, input request, or note.
_Avoid_: Transcript entry, message row

**Input Request**:
A Conversation Item where the Provider asks the user for information.
_Avoid_: Attention, queued input

**Approval Request**:
A Conversation Item where the Provider asks the user to approve or deny an action.
_Avoid_: Attention, permission state

**Turn**:
One user-initiated exchange within an Agent Session, starting with user input and ending when the Provider finishes or fails that exchange.
_Avoid_: Run, message, response

**Queued Input**:
User input accepted by Convergence for a running Session and held until it can be delivered to the Provider.
_Avoid_: Pending message, draft

**Mid-Run Input**:
User input sent while an Agent Session is already running or waiting for provider input.
_Avoid_: New Turn, queued draft

**Answer**:
Mid-Run Input that responds to an Input Request.
_Avoid_: Follow-up, Steer

**Follow-up**:
Mid-Run Input intended to run after the current Turn completes, either provider-native or Convergence-queued.
_Avoid_: Answer, Steer

**Steer**:
Mid-Run Input intended to influence the current running Turn without starting a new Turn.
_Avoid_: Follow-up, normal message

**Attachment**:
A file materialized for a session message and referenced by id from a **Conversation Item**.
_Avoid_: File blob, upload

**Transcript Entry View Model**:
A render-ready interpretation of one **Conversation Item** for the transcript surface, including copy text, timing, attachments, actions, and display labels.
_Avoid_: Transcript entry, renderer item

**Virtual Transcript Row**:
A viewport-managed rendering slot for a **Transcript Entry View Model** in the visible transcript surface. It is a UI performance detail, not a persisted session or conversation concept.
_Avoid_: Virtual conversation item, virtual message

**Bottom-Follow**:
Transcript scroll behavior where the visible transcript stays pinned to the newest **Conversation Item** only while the user is already near the bottom. Opening or switching to a session may jump to the newest item, but new output must not pull a user away from older content they are inspecting.
_Avoid_: Always auto-scroll, force scroll

### Turn Review

**Turn Review**:
The user activity of inspecting File Changes from one or more Turns.
_Avoid_: Product Feedback, Pull Request review

**File Change**:
A file-level modification captured for a Turn, including path, status, counts, and diff when available.
_Avoid_: Diff, working set

**Changed Files**:
A user-facing surface that lists File Changes.
_Avoid_: File-change model, working set

**Review Comment**:
A local annotation on a Turn, File Change, or diff line used for the user's own review and possible agent follow-up.
_Avoid_: Product Feedback, Pull Request comment

**Review Feedback**:
A composed message sent to the active Agent Session from selected Review Comments.
_Avoid_: Product Feedback, automatic fix request

**Risk Signal**:
An advisory rule-based marker on a File Change or Turn Review surface.
_Avoid_: Status, Attention, generated review

### Context And Injection

**Context Item**:
A reusable user-curated text block that can be selected for provider-visible input.
_Avoid_: Prompt snippet, hidden instruction

**Project Context Item**:
A Context Item scoped to a Project.
_Avoid_: Session context, Initiative context

**Session Context Selection**:
The explicit set of Context Items selected for a Session.
_Avoid_: Context attachments, hidden context

**Session Context Injection**:
The process that materializes a Session Context Selection into provider-visible Session input and, when needed, visible Conversation Items.
_Avoid_: Prompt injection, hidden context

**Context Mention**:
An ad hoc composer expansion that inserts a Context Item body into user text.
_Avoid_: Session Context Selection, injected context

**Initiative Context**:
The Initiative state relevant to an Attempt, including Current Understanding, Attempts, and Outputs.
_Avoid_: Project context, automatic injection

**Context Window**:
Provider-reported or estimated token capacity and usage for a Session.
_Avoid_: Context Item, Session Context Injection

## Relationships

- An **Initiative** may involve zero or more **Projects**.
- An **Initiative** may link zero or more **Sessions**.
- An **Initiative** may have zero or more **Outputs**.
- An **Output** has exactly one **Output Kind**.
- An **Output** may have zero or one **Output Source**.
- An **Output Source** is an **Attempt**.
- A **Release** is one kind of **Output**.
- A **Spec Output**, **Documentation Output**, and **Migration Note Output** are distinct **Output** kinds with different audiences and done criteria.
- An **External Issue Output** is a reference, not a synchronized issue-tracker object.
- An **App Release** is not an **Initiative** **Output**.
- An **Initiative** has exactly one **Current Understanding**.
- **Ready To Merge**, **Merged**, and **Released** are **Initiative** lifecycle **Statuses**.
- **Output Status** describes one deliverable artifact; **Initiative Status** describes the overall work lifecycle across Attempts and Outputs.
- An **Output** may be merged or released while the **Initiative** remains in another **Status** if follow-up work remains.
- A **Suggested Update** may propose changes to **Current Understanding** or **Outputs**.
- A **Suggested Update** does not become stable Initiative state until accepted by the user.
- A **Suggested Update** contains one or more **Suggested Update Parts**.
- A **Suggested Update Part** becomes stable Initiative state only through explicit user acceptance and may be folded into **Current Understanding** rather than persisted as its own object.
- An **App Update** may trigger **Notifications** but is not an **Initiative** or **Output**.
- **Release Notes** describe an **App Release** and may be shown in a What's New UI surface.
- **Status** and **Attention** are independent: lifecycle progress does not automatically mean user focus is required.
- **Attention** is shared domain language, but **Attention Reasons** are object-specific.
- A **Session Attention Reason** explains why a **Session** needs human focus.
- An **Initiative Attention Reason** explains why an **Initiative** needs human focus.
- A **Blocked** Initiative keeps its lifecycle **Status**; Blocked does not replace statuses such as implementing, reviewing, or planned.
- **Parked** is a lifecycle **Status** for intentionally paused work; **Blocked** is an **Initiative Attention Reason** for work that needs focus because progress is prevented.
- A **Stale** Initiative keeps its lifecycle **Status**; future freshness checks may suggest Stale Attention but should not silently set it unless that behavior is explicitly designed.
- **Activity** is independent of **Status** and **Attention** and changes as runtime behavior changes.
- A **Notification** may be triggered by an **Attention** transition or by another product event.
- A **Notification Channel** delivers a **Notification** but is never the source of truth for **Attention**.
- An **Attention Dismissal** hides one current **Attention** instance from user focus surfaces without changing the underlying **Attention** or **Status**.
- **Snooze** and **Acknowledge** are user actions that create an **Attention Dismissal**.
- **Archive** does not delete history and does not imply completion.
- Archiving a **Workspace** archives its non-independently-archived **Sessions** as part of hiding that working context.
- Unarchiving a **Workspace** restores only **Sessions** archived by that Workspace archive action.
- **Needs You** displays work items because of their **Attention**.
- **Waiting on You** and **Needs Review** are sections of **Needs You** derived from **Attention**.
- **Insights** displays **Local Analytics** and may include a **Work Profile**.
- A **Work Profile Snapshot** stores one generated **Work Profile** for one Local Analytics range.
- **Product Feedback** may be submitted to Convergence Cloud and is separate from **Local Analytics**.
- **App Settings** may provide **Session Defaults**.
- **Project Settings** belong to exactly one **Project**.
- **Session Defaults** prefill a new **Agent Session**; once the **Session** starts, selected **Provider**, **Model**, and **Effort** belong to that **Session**.
- An **Attempt** is exactly one **Session** linked to exactly one **Initiative**.
- An **Initiative** may have zero or one **Primary Attempt**.
- A **Primary Attempt** is still an **Attempt** and does not own the **Initiative**.
- An **Attempt** has exactly one **Attempt Role**.
- An **Attempt Role** describes why a **Session** is linked to an **Initiative**; it does not change the **Session** **Status** or **Initiative** **Status**.
- An **Initiative** may have zero or more **Seed Attempts**.
- A **Provider** may expose zero or more **Models**.
- A **Model** may expose zero or more **Effort** options.
- A **Provider** exposes **Provider Capabilities** that Convergence uses to gate UI and behavior.
- **Provider Availability** describes whether a **Provider** can be used in the current app environment.
- **Provider Status** displays **Provider Availability**, version, install metadata, and **Provider Update** information.
- A **Provider Update** maintains external Provider tooling and is not an **App Update**.
- A **Provider Debug Log** belongs to a **Session** but is not part of its **Conversation**.
- **Provider Continuation** belongs to an existing **Agent Session**.
- A **Continuation Token** enables **Provider Continuation** and is opaque outside the Provider adapter.
- **Continuation Recovery** preserves Convergence **Session** history while replacing stale provider-native continuation state.
- **Continuation Recovery** should create a visible note **Conversation Item** when provider-native context may have been lost.
- An **Attachment Capability** is one kind of **Provider Capability**.
- A **Skill** is discovered in a **Skill Catalog** according to **Provider Capabilities**.
- A **Skill** has a **Skill Scope**.
- A **Skill Selection** belongs to one **Turn**.
- **Skill Invocation** happens through the selected **Provider** and depends on **Provider Capabilities**.
- A **Skill** may depend on **Tools** or **MCP Servers**.
- An **MCP Server** may expose one or more **Tools**.
- An **MCP Server** has an **MCP Server Scope**.
- A Global **MCP Server Scope** means user-wide or built-in Provider configuration.
- A Project **MCP Server Scope** means configuration visible for one **Project**.
- A **Session** runs through exactly one **Provider**.
- An **Agent Session** runs through an AI agent **Provider**.
- A **Terminal Session** runs through the **Shell Provider**.
- A **Session Fork** has one parent **Session** and creates one child **Session**.
- A **Full Conversation Fork** and a **Structured Summary Fork** are the current **Session Fork** strategies.
- A **Structured Summary Fork** is seeded from a **Fork Summary**.
- A **Session Fork** may reuse the parent **Workspace** or create a new **Workspace** on a new **Branch**.
- A **Session Intent** currently creates either an **Agent Session** or a **Terminal Session**.
- A **Terminal Session** may have a persisted **Terminal Layout**.
- A **Primary Surface** can change without changing whether a Session is an **Agent Session** or **Terminal Session**.
- An **Output** may identify one **Attempt** as its source.
- An **Output** may reference a **Pull Request**.
- An **Output** may reference a **Branch**.
- A **Project** may have zero or more **Workspaces**.
- A **Project** currently has exactly one **Repository Root**.
- A **Workspace** is backed by one **Branch**.
- A **Workspace** is currently implemented by one **Worktree**.
- A **Removed Worktree** means the **Workspace** remains in Convergence but cannot be used for new work until restore support exists.
- A **Removed Worktree** preserves existing **Sessions**, **Outputs**, and **Workspace Pull Request** references for viewing.
- A **Removed Worktree** cannot be used as a working directory for new **Agent Sessions** or **Terminal Sessions** until restore support exists.
- A **Workspace** may be archived with or without its **Worktree** being removed.
- A **Workspace** may be created from a **Base Branch**.
- A **Workspace** may have zero or one cached **Workspace Pull Request**.
- A **Pull Request** has a head **Branch** and may have a **Base Branch**.
- A **Project** may contain zero or more **Sessions**.
- A **Session** may be rooted directly in a **Project** or in one **Workspace**.
- A **Session** has exactly one **Session Summary**.
- A **Session** has exactly one **Conversation**.
- A **Session** has zero or more **Conversation Items**.
- A **Conversation** contains zero or more **Conversation Items**.
- An **Input Request** is a kind of **Conversation Item**.
- An **Input Request** usually causes **Attention** on its **Session**.
- An **Approval Request** is a kind of **Conversation Item**.
- An **Approval Request** usually causes **Attention** on its **Session**.
- A **Transcript** renders a **Conversation**.
- A **Turn** contains one or more **Conversation Items**.
- Sending another message after an **Agent Session** completes creates a new **Turn** in the same **Session**, possibly using **Provider Continuation**.
- **Provider Continuation** does not create a new Convergence **Session** by itself.
- A **Session Fork** is the product action that creates a child **Session** for a separate work thread, seed strategy, or workspace/branch choice.
- A **Queued Input** belongs to one **Session**.
- **Mid-Run Input** may be an **Answer**, **Follow-up**, or **Steer**.
- A **Queued Input** may become a future **Follow-up** or provider-native mid-run input.
- An **Answer** responds to an **Input Request**.
- A **Follow-up** may become a future **Turn**.
- A **Steer** belongs to the current running **Turn**.
- A **Turn** may select zero or more **Skills**.
- A **Turn** may produce zero or more **File Changes**.
- **Turn Review** inspects **File Changes** produced by **Turns**.
- **Changed Files** displays **File Changes**.
- A **Review Comment** may refer to a **Turn**, **File Change**, or diff line.
- **Review Feedback** is composed from selected **Review Comments** and sent as user-authored input to an **Agent Session**.
- A **Risk Signal** may decorate a **File Change** but does not change **Status** or **Attention**.
- A **Project Context Item** is a **Context Item** scoped to exactly one **Project**.
- A **Session Context Selection** contains zero or more **Context Items**.
- **Session Context Injection** can add provider-visible text to a **Session** turn and can create a visible note **Conversation Item**.
- **Context Mention** inserts a **Context Item** body into user-authored text without creating a durable **Session Context Selection**.
- **Initiative Context** is shown to the user and may become provider-visible only through explicit selection.
- **Context Window** is telemetry and does not describe which **Context Items** were selected or injected.
- A **Conversation Item** may reference zero or more **Attachments**.
- An **Attachment** is not a **Context Item** unless the user intentionally curates its content into one.
- A **Transcript Entry View Model** is derived from exactly one **Conversation Item**.
- A **Virtual Transcript Row** renders exactly one **Transcript Entry View Model** and must not become a domain or persistence boundary.
- **Bottom-Follow** applies to the visible transcript surface and depends on user scroll position, not only on whether new **Conversation Items** arrive.

## Example dialogue

> **Dev:** "Can the sidebar load every **Conversation Item** to show attention state?"
> **Domain expert:** "No. The sidebar uses **Session Summary** only; **Conversation Items** are loaded for the active transcript."

## Flagged ambiguities

- "transcript" used to mean both conversation storage and the visible surface. Resolved: **Conversation** is the ordered data; **Transcript** is the visible UI surface; the old `sessions.transcript` blob is legacy migration input only.
- `CONTEXT.md` was originally scoped to session and transcript architecture. Resolved: it is now the whole-product glossary for Convergence.
- The repository contains many historical Markdown specs written with inconsistent terminology. Resolved: keep them as reference material until the glossary and ADRs are strong enough to replace them intentionally.
- Older specs describe **Project** as the top-level domain object. Resolved: **Initiative** is the top-level unit of work; **Project** is the local codebase context.
- "project" can mean a product codebase or a single Git repository. Resolved: **Project** is the product codebase context; **Repository Root** is the local Git path. Current implementation supports one **Repository Root** per **Project**.
- Older docs mention Project copy flows and copy skip lists. Resolved current rule: **Workspace** is currently backed by a Git **Worktree**; copy-style workspaces may become another Workspace implementation type later, but **Project Copy** is not current product language.
- **Current Understanding** currently contains decisions, open questions, and next actions as user-curated text. Resolved: keep them inside **Current Understanding** until real usage proves that separate first-class objects are needed.
- "Decision" and "Open question" may appear as section labels in **Current Understanding** or **Suggested Update Parts**, but they are not yet durable domain objects with their own lifecycle.
- "Next action" may appear in **Current Understanding** or **Suggested Update Parts**, but it is not yet a durable domain object with its own lifecycle.
- Some code may blur **Status** and **Attention** through state names or UI labels. Resolved domain rule: **Status** is lifecycle; **Attention** is human focus.
- Sessions and Initiatives use different concrete attention values. Resolved domain rule: **Attention** is the shared concept; **Session Attention Reasons** and **Initiative Attention Reasons** are type-specific reason vocabularies.
- `needs-you` is currently an Initiative attention value but conflicts with **Needs You** as the UI surface. Resolved future rule: replace it with a more precise **Initiative Attention Reason** before Initiative workflows become heavily used.
- `blocked` can sound like lifecycle status. Resolved domain rule: **Blocked** is an **Initiative Attention Reason**; **Parked** is the lifecycle status for intentionally paused work.
- `stale` can mean an automatic age label or a human review signal. Resolved current rule: **Stale** is an **Initiative Attention Reason** curated by the user; future automation may suggest it but should not silently set it without an explicit product decision.
- Notifications can make Attention visible, but are delivery policy rather than work state. Resolved domain rule: **Attention** is the domain signal; **Notification** is a delivery event; **Notification Channels** are concrete routes such as toast, system notification, dock badge, dock bounce, sound, and inline pulse.
- User actions can hide items from Needs You without clearing Attention. Resolved domain rule: **Attention Dismissal** hides one current **Attention** instance; **Snooze** and **Acknowledge** create dismissals and do not change **Status** or **Attention**.
- `useProjectContextStore.attachmentsBySessionId` uses "attachments" for selected context items, which conflicts with file **Attachments**. Resolved domain rule: selected Context Items are a **Session Context Selection**, not Attachments.
- Some UI still says "Conversation" where the product language now means **Agent Session**. Resolved domain rule: **Agent Session** is the counterpart to **Terminal Session**.
- Pull requests appear both as external delivery artifacts and as workspace lookup/cache data. Resolved domain rule: **Pull Request** is the external artifact; **Workspace Pull Request** is Convergence's cached association between a **Workspace** and a **Pull Request**; an **Output** may reference the external **Pull Request**.
- Branches appear in Workspace creation, Pull Requests, and Initiative Outputs. Resolved domain rule: **Branch** and **Base Branch** are Git concepts; **Workspace Branch** is not a separate domain object unless Convergence later models branch lifecycle directly.
- "Settings" alone can refer to app-wide preferences, Project preferences, or defaults for starting Sessions. Resolved domain rule: use **App Settings**, **Project Settings**, or **Session Defaults**; active Sessions have selected Provider/Model/Effort, not live settings.
- "Update" can mean Initiative synthesis, app distribution, settings persistence, or ordinary data mutation. Resolved domain rule: use **Suggested Update** for Initiative synthesis proposals and **App Update** for Convergence software updates; avoid generic "update" in product language unless it is ordinary UI copy.
- "Release" can mean a deliverable produced by an Initiative or a published Convergence app version. Resolved domain rule: **Release** is an Initiative **Output**; **App Release** is Convergence distribution; **App Update** installs an **App Release**.
- `merged` and `released` appear as both Initiative and Output statuses. Resolved domain rule: **Output Status** describes one deliverable artifact; **Initiative Status** describes the aggregate work lifecycle.
- "What's New" is the UI label for viewing **Release Notes**. Resolved domain rule: **Release Notes** is the artifact/content term; What's New is not a separate domain term.
- Provider diagnostics can blur availability, status, and update state. Resolved domain rule: **Provider Availability** is the core runtime usability signal; **Provider Status** is the report surface; **Provider Update** is external Provider package or binary maintenance.
- MCP visibility can be confused with Project Context or Provider Availability. Resolved domain rule: **MCP Server Scope** describes configuration origin and visibility for an **MCP Server**, not selected text context or runtime Provider usability.
- Skill discovery, selection, and activation can collapse into one "skill support" idea. Resolved domain rule: **Skill Catalog** is discovery, **Skill Selection** is the user's Turn-level choice, and **Skill Invocation** is Provider-specific execution mechanics.
- Continuation can be confused with Session Fork or transcript replay. Resolved domain rule: **Provider Continuation** resumes provider-native state for the same **Agent Session**; **Continuation Token** is the opaque provider id; **Continuation Recovery** starts fresh only when that provider-native state is stale or missing.
- Continuing a completed **Agent Session** can look like a new run. Resolved domain rule: a same-session continuation creates a new **Turn** in the same **Session**; only **Session Fork** creates a child **Session**.
- Fork strategy can be confused with workspace choice. Resolved domain rule: **Full Conversation Fork** and **Structured Summary Fork** describe how the child Session is seeded; reusing or creating a Workspace is a fork configuration choice using existing **Workspace** and **Branch** terms.
- "Full Transcript Fork" may remain UI copy or historical wording, but the domain term is **Full Conversation Fork** because the seed comes from **Conversation** data, not the **Transcript** surface.
- A **Session Fork** currently creates a child Session in the same **Project**. Cross-Project follow-on work should not be assumed to be a normal Session Fork; it needs an explicit product decision.
- Analytics language can drift between metrics, UI, and generated profile content. Resolved domain rule: **Local Analytics** is the local-only data and metrics domain; **Insights** is the UI surface; **Work Profile Snapshot** is persisted generated profile output for a selected range.
- "Feedback" can mean app feedback, agent feedback, or ordinary UI validation. Resolved domain rule: **Product Feedback** is the cloud-submitted app feedback path; do not use it for Turn-level agent review flows or Local Analytics.
- Review flows can blur local notes, cloud feedback, and PR review. Resolved domain rule: **Turn Review** is local inspection of agent-produced **File Changes**; **Review Comments** are local annotations; **Review Feedback** is the composed message sent back to the active **Agent Session**; **Risk Signals** are advisory decorations only.
- Needs You sublabels can look like domain states. Resolved domain rule: **Waiting on You** and **Needs Review** are UI section labels derived from **Attention**, not independent lifecycle states or domain objects.
- Dialog names should not automatically become glossary terms. Resolved domain rule: add stable product surfaces and domain concepts to this context; leave ordinary dialogs named after their underlying domain terms unless the surface name carries additional domain meaning.
- Mid-run input modes can be confused with normal Turn creation. Resolved domain rule: **Mid-Run Input** is input while an **Agent Session** is running or waiting; **Answer** responds to an **Input Request**; **Follow-up** runs after the current **Turn**; **Steer** affects the current running **Turn**. Interrupt remains internal until exposed as product behavior.
