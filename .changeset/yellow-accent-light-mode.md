---
'convergence': patch
---

Make selection and hover highlights visible in light mode by retuning `--accent` from `oklch(0.955 0 0)` (a near-white that gave only ~0.03 lightness delta against the popover surface) to a warm pale yellow `oklch(0.915 0.075 95)` with a matching darker `--accent-foreground`. The Command palette selected row, searchable-select highlight, dropdown focus state, button ghost/outline hover, sidebar active session, and selected file rows are now clearly distinguishable on the light theme. Dark mode is unchanged.
