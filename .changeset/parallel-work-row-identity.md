---
'convergence': patch
---

The parallel-work panel tells two rows with the same id apart, and the answer
window compares times rather than their spelling (MAR-2902).

A row's id in the panel is the harness's own — a run id for an agent row, a task
id for a task row — and those two namespaces are not disjoint. A background task
whose id happened to equal a run id produced two rows that every per-row surface
read as one: collapsing either folded both, a selection resolved to whichever
came first, and a Stop pressed on one named the other in its confirmation. Every
surface now keys on the row's kind and id together — collapse, select, confirm,
stop state, the ancestor walk, the result link and the panel's own row markers —
so the two rows can never be mistaken for each other.

The count beside a finished answer had a second, quieter version of the same
problem. "Did this failure happen in the current turn?" was decided by comparing
two timestamps as text, and `…00.000Z` sorts before `…00Z` even though they are
the same instant: a failure stamped at exactly the turn's start was counted or
dropped depending on which writer wrote it and at what precision. The comparison
now reads both sides as times. Stamps that are not timestamps at all — pre-ISO
rows — still compare exactly as they did.
