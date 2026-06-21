---
'convergence': minor
---

Redesign the Skills dialog into a management surface. It now opens on an **Overview** dashboard (totals, breakdown by origin — project / global / plugin / built-in — by provider, and a "needs attention" list), adds a card **Grid** with provider/scope/readiness grouping alongside the existing **List** view, and surfaces skill origin as a first-class colour-coded dimension with a new origin filter and precise per-warning-code filtering. Drilling from a dashboard card applies a single fresh filter and returning to the overview clears it. The detail pane gains **Reveal in Finder** and **Open SKILL.md** actions (backed by validated `skills:reveal` / `skills:openPath` IPC), and provider discovery errors now show their actual message.
