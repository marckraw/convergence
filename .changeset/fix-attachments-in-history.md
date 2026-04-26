---
'convergence': minor
---

Show attachments inside conversation history.

Two issues fixed:

- Provider adapters (Claude Code, Codex, Pi) were dropping `attachmentIds` when emitting the persisted user message. The model still received the bytes, but the stored `ConversationItem` had no record of which attachments were sent. This regressed during the conversation-normalization migration; the emitter signature already supported the field.
- The transcript view never rendered attachment chips on stored user messages, even before the regression — the original session-attachments spec only covered the composer surface.

Now: attachments persist on the user message, the session view hydrates attachment metadata once per mount, and chips render inline below the user text. Clicking a chip opens the same preview modal used by the composer. Attachments whose underlying file is no longer available render as a broken-icon "Unavailable" chip.
