---
'convergence': patch
---

Fix structured-summary preview in the fork dialog. The session-fork
service was detaching `provider.oneShot` into a local variable before
invoking it, which lost the method's `this` binding and caused the
Claude Code adapter to read `binaryPath` off `undefined`. The preview
call now invokes `oneShot` directly on the provider, matching the
pattern used by session auto-naming.
