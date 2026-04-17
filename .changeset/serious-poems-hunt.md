---
'convergence': patch
---

Fix intermittent attachment failures caused by legacy attachment foreign keys.

Draft attachments created before a session exists now recover from stale
`attachments.session_id -> sessions.id` schemas by repairing the table and
retrying the insert. The database migration also detects that legacy foreign
key using SQLite metadata instead of brittle SQL text matching.
