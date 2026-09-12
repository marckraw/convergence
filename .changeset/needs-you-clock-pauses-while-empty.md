---
'convergence': patch
---

The Needs You clock runs while the feed has cards, and refreshes the moment one
arrives (MAR-2994).

The sidebar kept a 60-second `setInterval` alive for the whole life of the
window, including for a feed with nothing in it: once a minute, all night, React
woke to recompute an empty list. The interval exists only to re-render relative
times — "4 minutes ago" is a claim about now, not about the session — so with no
cards on screen there is nothing for a tick to change.

The timer now follows the feed: it starts when the feed has cards and is
cancelled when the last one goes. Simply gating it would have introduced a
worse bug than the one it fixed, because a clock that is merely stopped resumes
holding the time it stopped at — the first card to arrive after a quiet hour
would have rendered "an hour ago" and stayed wrong until the first restarted
tick a minute later. So arrival refreshes the clock immediately and then ticks
each minute.

Pausing cannot hide a card. `now` reaches only the card's relative-time label;
which sessions become cards, and which group they land in, are decided from the
session rows alone, so no card can appear merely because time passed.
