---
'convergence': minor
---

Redesign the Skills dialog into a management surface. It now opens on an **Overview** dashboard (totals, breakdown by origin — project / global / plugin / built-in — by provider, and a "needs attention" list), adds a card **Grid** with provider/scope/readiness grouping alongside the existing **List** view, and surfaces skill origin as a first-class colour-coded dimension with a new origin filter and precise per-warning-code filtering. Drilling from a dashboard card applies a single fresh filter and returning to the overview clears it.

The detail pane gains tooltip-labelled actions: **Reveal in Finder**, **Open SKILL.md**, and an **Open in editor** menu (Cursor / VS Code / Zed / WebStorm / Finder), with a loading spinner while a shell action is in flight. Provider discovery errors now show their actual message.

Provider scanning is resilient: Codex scans are cached with a TTL (a timeout is never cached) and run on a longer budget, and providers now **stream into the dialog as each one resolves** — fast filesystem providers appear immediately while slower ones (Codex) fill in behind a "loading more" indicator. The detail slide-over animates in and out with a spring (via `motion`), and the dialog gets typography polish (tabular numbers, balanced/pretty text wrapping, scale-on-press).
