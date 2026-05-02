# Convergence Context

Convergence is a UI-first desktop app for managing AI agent work across local codebases. This context records product language for session and transcript architecture so future changes preserve the normalized conversation model.

## Language

**Session**:
An agent work stream rooted in a project or workspace, with summary state and an ordered conversation.
_Avoid_: Chat, run

**Session Summary**:
The lightweight state used by list, attention, and navigation surfaces without loading conversation content.
_Avoid_: Session row, session metadata

**Conversation Item**:
A first-class ordered unit in a session conversation, such as a user message, assistant message, tool call, tool result, approval request, input request, or note.
_Avoid_: Transcript entry, message row

**Session Context Injection**:
The process that materializes selected project-level context into provider-visible Session input and, when needed, visible **Conversation Items**.
_Avoid_: Prompt injection, hidden context

**Transcript Entry View Model**:
A render-ready interpretation of one **Conversation Item** for the transcript surface, including copy text, timing, attachments, actions, and display labels.
_Avoid_: Transcript entry, renderer item

**Virtual Transcript Row**:
A viewport-managed rendering slot for a **Transcript Entry View Model** in the visible transcript surface. It is a UI performance detail, not a persisted session or conversation concept.
_Avoid_: Virtual conversation item, virtual message

**Bottom-Follow**:
Transcript scroll behavior where the visible transcript stays pinned to the newest **Conversation Item** only while the user is already near the bottom. Opening or switching to a session may jump to the newest item, but new output must not pull a user away from older content they are inspecting.
_Avoid_: Always auto-scroll, force scroll

**Attachment**:
A file materialized for a session message and referenced by id from a **Conversation Item**.
_Avoid_: File blob, upload

## Relationships

- A **Session** has exactly one **Session Summary**.
- A **Session** has zero or more **Conversation Items**.
- **Session Context Injection** can add provider-visible text to a **Session** turn and can create a visible note **Conversation Item**.
- A **Conversation Item** may reference zero or more **Attachments**.
- A **Transcript Entry View Model** is derived from exactly one **Conversation Item**.
- A **Virtual Transcript Row** renders exactly one **Transcript Entry View Model** and must not become a domain or persistence boundary.
- **Bottom-Follow** applies to the visible transcript surface and depends on user scroll position, not only on whether new **Conversation Items** arrive.

## Example dialogue

> **Dev:** "Can the sidebar load every **Conversation Item** to show attention state?"
> **Domain expert:** "No. The sidebar uses **Session Summary** only; **Conversation Items** are loaded for the active transcript."

## Flagged ambiguities

- "transcript" can mean the visible transcript surface or the old `sessions.transcript` JSON blob. Resolved: the old blob is legacy migration input only; live rendering uses **Conversation Items** and **Transcript Entry View Models**.
