/**
 * The time budget for suites that drive a **real** `git` (MAR-2130, MAR-2248).
 *
 * A handful of suites init bare repositories, fetch between them, and create
 * worktrees on disk. That is the whole point of those tests — the bugs they
 * catch live in how git actually behaves, so replacing the subprocess with a
 * fake would delete what they verify.
 *
 * The cost is that their wall-clock time is not a property of the code under
 * test. The same test measured 1.1s and 3.6s in back-to-back isolated runs;
 * inside the full suite, where the other ~290 files are competing for the same
 * cores and disk, it periodically crosses vitest's 5s default and fails with
 * "Test timed out in 5000ms" — a red that says nothing about the product.
 *
 * So the budget is **named and local** rather than a raised global default.
 * Raising `testTimeout` globally would hide a genuine hang anywhere in the
 * suite; this constant is spent only where a subprocess is genuinely doing the
 * work, and it says why in one place.
 *
 * It is not a target. These suites finish in well under a second each on an
 * idle machine; the headroom exists for the loaded case, and a test that
 * actually reaches this number is hung rather than slow.
 */
export const GIT_INTEGRATION_TEST_TIMEOUT_MS = 30_000
