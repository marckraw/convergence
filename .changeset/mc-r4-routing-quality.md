---
'convergence': patch
---

Mission Control: wires that go round things (MAR-2836).

Connections now leave and arrive by the side the two cards actually face, so a
card you drag to the left of its source is entered from the right instead of
having the line loop round to the wrong edge. Routes are rounded orthogonal
lines that stay clear of the cards they are not attached to, with the label on
the longest straight run rather than sitting on a corner.

A route follows its cards as you move them, and every segment of it runs
along an axis — including the two that touch the cards, which used to be a few
pixels out of true. The diagram stays inside its own frame — no line painted
across the panel beside it — and a crew's frame grows around a card dragged
above or to the left of it, not only below and to the right. Adding a
conversation to a crew fits the view so the new card is on screen.

Where a route genuinely cannot get through, the wire falls back to a plain
straight line: a line you can follow beats a clever one drawn through a card.
