---
'convergence': patch
---

Internal: the session send/create chain takes named options instead of long
positional argument lists (MAR-2227). `createAndStartSession` was fourteen
positional parameters, `createAndStartGlobalSession` ten and
`sendMessageToSession` seven, which is how call sites ended up reading
`undefined, undefined, null` and why the composer branched four ways just to
skip past optional arguments it had nothing to say about. Behaviour is
unchanged; the next session-scoped setting is now additive rather than a
rewrite of every caller.
