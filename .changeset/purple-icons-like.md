---
---

Docs and a canary; no user-facing change. A docblock in `relay.service.ts` now
documents the method it describes, ten more blocks were filed the same way, two
stale ones were deleted, and a test walks both source trees so a docblock that
documents another docblock cannot land silently again (MAR-3151).
