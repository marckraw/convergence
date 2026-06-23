---
'convergence': patch
---

Polish the Skills dialog. The detail header is now a single full-width column (description spans the whole panel), with the chips hard-left and the action cluster hugging the right edge on one bottom-aligned row; the three copy icons collapse into a single **Copy ▾** menu (name / SKILL.md path / invocation). The dialog and detail slide-over are larger on big screens while still clamping to the viewport on small ones. Selection behaviour is tighter: the **Overview** clears the selection (so the footer path no longer lingers there), Grid and List preserve it, and returning to **Grid** with a skill selected re-opens its detail slide-over.
