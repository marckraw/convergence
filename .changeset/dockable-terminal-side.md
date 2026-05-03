---
'convergence': minor
---

feat(terminal): per-session dock placement (bottom/left/right)

The secondary terminal dock can now sit on the left or right of the
conversation in addition to the bottom. Press `Cmd+Shift+T`
(`Ctrl+Shift+T` on non-mac) to cycle bottom → right → left → bottom.
Placement, height, and width are remembered per session, so one session
can keep the terminal at the bottom while another runs it as a side
panel. The dock resize handle automatically switches between vertical
and horizontal drag depending on placement, and double-click still
resets to the default size on the active axis. Terminal-primary
sessions are unaffected — their conversation placeholder stays at the
bottom.
