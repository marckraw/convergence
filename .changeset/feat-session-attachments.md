---
'convergence': minor
---

Add session attachments support for images, PDFs, and UTF-8 text files. Users can attach files via a `+` button, clipboard paste, or drag-and-drop onto the composer; each provider receives attachments in its native format (Claude Code: base64 content blocks + PDFs; Codex: `localImage` entries; Pi: base64 `images[]`). Capability is surfaced per provider — PDFs are Claude-Code-only, and incompatible attachments render a red-outlined chip with a blocked send button. Attachments persist under `{userData}/attachments/{sessionId}/`, are orphan-swept on boot, and are cascaded on session delete.
