---
'convergence': patch
---

Prevent packaged macOS builds from crashing on launch when the
`electron-updater` module loads with an unexpected export shape.
Convergence now disables auto-updates for that build instead of aborting
startup, so affected users can still open the app and install a follow-up
release.
