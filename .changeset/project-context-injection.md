---
'convergence': minor
---

Project-level context items can now be injected into agent sessions. Define reusable text blocks per project under Project Settings → Context (label, body, boot vs. every-turn re-inject mode), attach them at session create with a chip strip, and the active session shows an "Every-turn context active" badge above the composer when items are flagged for re-injection.

Three injection paths land in v1, all provider-neutral (Claude Code, Codex, PI):

- **Boot**: attached items are wrapped as `<{project-slug}:context>...</{project-slug}:context>`, emitted as a sequence-1 `note` ConversationItem, and prepended to the user's first message before the provider sees it.
- **Every-turn**: items flagged `every-turn` are read fresh per send and prepended to every user-initiated message — typed turns, queued follow-ups, and input-request answers — so an edit between turns is reflected on the next send. Approval responses, tool results, and assistant continuations are explicitly excluded.
- **Mention**: type `::name` in the composer to open a filtered picker that inlines the chosen item's body verbatim. Nothing is persisted as a token; the expanded text is what the provider sees and what the transcript stores.

Past sends are immutable: editing or deleting a project context item never rewrites prior transcript entries. Schema additions: `project_context_items` and `session_context_attachments` (both with `ON DELETE CASCADE`).
