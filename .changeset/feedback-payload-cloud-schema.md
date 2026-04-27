---
"convergence": patch
---

Fix feedback submission so feature requests actually reach Convergence Cloud. The cloud enforces a flat `metadata` record of primitive values, so the desktop app now flattens session context into `context.<key>` entries and omits unset optional fields instead of sending `null`. Failed submissions also surface the cloud's error body in the dialog instead of a bare HTTP status.
