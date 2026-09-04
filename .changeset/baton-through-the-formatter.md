---
'convergence': patch
---

The baton line is read through bold, italics and code marks — around the line and around the name — so `**BATON: horse**` and `BATON: **horse**` route exactly like the plain line, and `baton:horse` without a space now matches a wire waiting for `BATON: horse`. A held hop says which line it read, and a hand-off that names nobody (`BATON: **`, or a bare `BATON:`) hails instead of vanishing. Baton names that start or end with `*`, `_` or a backtick, or that contain no letter or number at all, are refused — and the crew's loop panel now shows the reason under the field and saves a name when you leave the field or press Enter, instead of storing every keystroke.
