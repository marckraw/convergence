---
'convergence': patch
---

Harness evidence attributes an event to a turn by comparing times, not the text
carrying them (MAR-2992).

The JS half of the seam the parallel-work answer window closed in the SQL
(MAR-2902). An event with no `turnId` in its payload is attributed to the latest
turn that started at or before it, and that comparison was made on the stamps as
strings. A turn written `2026-09-09T11:00:00Z` against an event written
`2026-09-09T11:00:00.000Z` — the same instant in two spellings — compared as
`'Z' > '.'`, so the event was handed to the previous turn. Which turn an event
belongs to is not something a writer's choice of precision gets to decide.

Both stamps are now read as instants, with the same fallback the SQL window
uses: a value neither side can read as a time — a fixture label, a pre-ISO row —
is compared exactly as it was before. Latent in practice, since every writer
today stamps with `toISOString()`; the turn does not have to.

The window's own comment no longer overclaims: SQLite's `julianday()` reads a
bare numeric string as a day number, so the fallback is not a perfect copy of
the old text comparison for those values. No writer emits them. Both boundary
orderings are now pinned on both sides.
