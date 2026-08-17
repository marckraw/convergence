---
'convergence': patch
---

The Canvas now wears the room's theme instead of the drawing library's
(MAR-2480).

React Flow ships its own light and dark styling, and nothing had told it which
one we were in — so the zoom and fit controls sat on the canvas as a stock white
panel, visibly borrowed from somewhere else. They now follow the titlebar
toggle live, switching the moment you switch, and their colours are the app's
own: the same surface, border and text tokens the rest of the chrome uses,
rather than the library's greys.

The rest of the canvas was swept in both modes at the same time, which turned up
things that only went wrong in the light one. A disarmed wire was drawn in a
flat white and was therefore invisible on a light canvas — it now takes a colour
that resolves against whichever theme is on. The crew boxes, the spawn chips and
the wire popover had borders that assumed a dark background and faded out on a
light one. The dot grid had an opacity layered on top of an already-faint colour
and disappeared entirely in light mode.
