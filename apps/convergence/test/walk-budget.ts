/**
 * The time budget for tests that walk a source tree (MAR-2989).
 *
 * A few tests answer a question about the repository rather than about a
 * module: which files import AJV, which dialog kinds something actually mounts,
 * where every import in both trees resolves to. They answer it by reading the
 * tree — which is the point, because a hand-maintained list of the same facts
 * goes stale exactly the way the code it guards did.
 *
 * The cost is that their wall-clock time is a property of the repository's
 * size and of whatever else is running, not of the code under test. Measured
 * alone on an idle machine they are cheap — the AJV import guard 100 ms, the
 * command-palette scan 11-16 ms, the import-ownership sweep 1.4-1.5 s. Measured
 * inside a loaded suite, where ~400 files compete for the same cores and disk,
 * the same walks have been recorded at 5.4-8.1 s and 7.1 s, over vitest's 5 s
 * default. That red says the machine was busy; it says nothing about AJV.
 *
 * So the budget is **named and shared** rather than a raised global default.
 * Raising the default would hide a genuine hang anywhere in the suite; this
 * constant is spent only where a walk is genuinely doing the work, and it says
 * why in one place instead of in a literal beside each walk.
 *
 * It is not a target. Every walker finishes in under two seconds on an idle
 * machine; the headroom exists for the loaded case, and a walk that actually
 * reaches this number is hung rather than slow.
 *
 * `walk-budget.test.ts` beside this file pins both halves: that the number
 * stays patient, and that every walker actually spends it.
 */
export const WALK_TEST_TIMEOUT_MS = 30_000
