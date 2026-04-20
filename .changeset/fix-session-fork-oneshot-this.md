---
'convergence': patch
---

Fix structured-summary preview in the fork dialog.

- The session-fork service was detaching `provider.oneShot` into a
  local variable before invoking it, which lost the method's `this`
  binding and caused the Claude Code adapter to read `binaryPath` off
  `undefined`. The preview call now invokes `oneShot` directly on the
  provider, matching the pattern used by session auto-naming.
- Summary extraction now runs with a 180s timeout (up from the 20s
  default) because extracting a structured summary from a full parent
  transcript is meaningfully slower than the short-prompt naming call
  the default was tuned for.
