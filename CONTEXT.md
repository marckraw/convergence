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

**Transcript Entry View Model**:
A render-ready interpretation of one **Conversation Item** for the transcript surface, including copy text, timing, attachments, actions, and display labels.
_Avoid_: Transcript entry, renderer item

**Attachment**:
A file materialized for a session message and referenced by id from a **Conversation Item**.
_Avoid_: File blob, upload

## Relationships

- A **Session** has exactly one **Session Summary**.
- A **Session** has zero or more **Conversation Items**.
- A **Conversation Item** may reference zero or more **Attachments**.
- A **Transcript Entry View Model** is derived from exactly one **Conversation Item**.

## Example dialogue

> **Dev:** "Can the sidebar load every **Conversation Item** to show attention state?"
> **Domain expert:** "No. The sidebar uses **Session Summary** only; **Conversation Items** are loaded for the active transcript."

## Flagged ambiguities

- "transcript" can mean the visible transcript surface or the old `sessions.transcript` JSON blob. Resolved: the old blob is legacy migration input only; live rendering uses **Conversation Items** and **Transcript Entry View Models**.
