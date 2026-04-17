---
'convergence': patch
---

Fix two composer/sidebar defects.

- Attachments: fix `FOREIGN KEY constraint failed` when attaching to a session that hasn't been created yet. Drafts ingest under the sentinel `__new__` session id, and the real session id is rebound (files moved + row updated) on the first `session.start`/`sendMessage`. The `attachments` table no longer FK-references `sessions(id)`; cleanup stays correct via the existing explicit `deleteForSession` path and a broader orphan sweep that also prunes DB rows whose session is gone. Existing databases are migrated in place.
- Sidebar: the "Regenerate name" action now shows a spinner on the session row (and in the dropdown item) while the naming agent runs, so users can see that regeneration is in flight. The menu item is disabled while regenerating to prevent double-invocation.
