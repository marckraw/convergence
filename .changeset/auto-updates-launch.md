---
'convergence': minor
---

Ship automatic updates for packaged macOS builds. Convergence now checks
GitHub Releases for new versions on startup (after a 10s delay) and
every four hours thereafter, then surfaces any available update through
an actionable toast, a new section in Settings, and a `Check for
updates…` entry in the Command Center.

The flow never installs silently: users are asked before downloading
and again before installing. Background checking is opt-out via
Settings → Updates → "Check for updates automatically".

Release artifacts now ship both Intel (`x64`) and Apple Silicon
(`arm64`) variants; electron-updater picks the matching arch at
runtime from the published `latest-mac.yml`.

Dev mode (`npm run dev`) disables every update code path — the Settings
section and the Command Center item stay visible but are clearly marked
as disabled.

**One-time note:** users on v0.16.0 or earlier need to download and
install this release manually (via the DMG on GitHub). Every release
from this version onward will be picked up by the auto-updater.
