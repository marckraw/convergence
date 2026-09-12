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

Both stamps are now read as instants when both are unambiguously one, and by a
strict ISO gate rather than by `Date.parse`, which reads far more than a time:
`'10'` is October 2001 under V8's legacy month parse, and a stamp carrying no
offset is local time in JS where SQLite reads it as UTC. Anything the gate turns
away — a fixture label, a pre-ISO row, a stamp without an offset — is compared
exactly as it was before, and the answer no longer depends on where the machine
stands. Latent in practice, since every writer today stamps with
`toISOString()`; the turn does not have to.

Neither comment overclaims any more: SQLite's `julianday()` reads a bare numeric
string as a day number, so one difference between the two sides survives
deliberately and is named where it lives. No writer emits such a value. Both
boundary orderings are pinned on both sides, and both halves of the gate are
pinned by the values the column can really carry.
