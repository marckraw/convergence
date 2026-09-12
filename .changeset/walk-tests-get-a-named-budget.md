---
'convergence': patch
---

The tests that walk a source tree spend one named budget (MAR-2989).

No shipped behaviour changes: this is the test suite's own wiring. A handful of
tests answer a question about the repository by reading it — which files import
AJV, which dialog kinds something actually mounts, where every import resolves.
Their cost is a property of the tree's size and of whatever else is running, so
under a loaded suite they had been recorded at 5.4-8.1s and 7.1s against
vitest's 5s default: a red that says the machine was busy and nothing about the
product.

Each walk had been answering that separately — a `30_000` literal added to one
test, a `20_000` on another, nothing at all on the third. They now share
`WALK_TEST_TIMEOUT_MS`, with the reasoning in one place instead of restated
beside each walk, and a canary that fails if a walker stops spending it, if an
inline literal comes back, or if the budget is raised globally instead, which
would hide a genuine hang anywhere in the suite.

Measured alone, the walks are cheap — the AJV guard 100ms, the command-palette
scan 11-16ms, the import-ownership sweep 1.4-1.5s — so the walks are kept and
given headroom rather than replaced by checked-in fixture lists, which would
need regenerating and would stop reading the tree they exist to check.

Two of the walks also moved out of `*.pure.test.ts` files, which in this
repository name the test of a `*.pure.ts` module: a repository-sized walk filed
inside a module's suite is what made the AJV guard the test that lost the race.
