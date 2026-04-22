---
'convergence': minor
---

Normalize sessions around lightweight summaries and first-class conversation
items instead of embedded transcript blobs. Providers now emit a canonical
delta stream that the backend persists into `session_conversation_items`, and
the renderer consumes split summary/detail session data rather than hydrating
full conversations everywhere.

This release also updates forking and session surfaces to work from normalized
conversation items, migrates existing local transcript-backed sessions to the
new model on startup, and rebuilds legacy databases to drop the old
`sessions.transcript` storage once the normalized conversation rows are in
place.
