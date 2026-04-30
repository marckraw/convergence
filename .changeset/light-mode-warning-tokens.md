---
'convergence': patch
---

Fix unreadable warning chips in light mode by introducing semantic `--warning` and `--warning-foreground` design tokens. The Skills dialog (and 16 other call sites) previously used `text-amber-100` / `text-amber-200` without a light-mode variant, which rendered as near-invisible pale text on light backgrounds. All amber warning utilities are now expressed as `bg-warning/X`, `border-warning/X`, `text-warning`, and `text-warning-foreground`, so retuning the warning hue is a one-line change in `src/app/global.css`.
