---
'convergence': patch
---

Fix command palette and searchable select highlighting in light mode. The selected row used `bg-white/10`, which was invisible against the near-white popover background. Switched to theme tokens (`bg-accent` / `text-accent-foreground`) so the highlight has proper contrast in both light and dark modes.
