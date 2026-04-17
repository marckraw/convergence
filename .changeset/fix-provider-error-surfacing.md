---
'convergence': patch
---

Surface Codex turn-start failures and main-process startup failures to the user. Previously a rejected `turn/start` JSON-RPC call in the Codex provider was silently swallowed, leaving the session stuck in `running` with no feedback; it now emits a system transcript entry and transitions the session to `failed`. Unhandled rejections during Electron main-process init (database open, provider detection, IPC registration) would leave the app running with no window; they now show a native error dialog and quit cleanly.
