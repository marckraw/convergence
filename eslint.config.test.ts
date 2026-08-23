import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Canary for this repo's own lint configuration (MAR-2545).
 *
 * The two React hook rules are the one safety net nothing else in the repo
 * observes: delete the `react-hooks` block from `eslint.config.mjs` and its
 * import, and `npm run lint` exits 0 with no output while every other gate
 * stays green. That silent absence is how a renderer built almost entirely
 * from `useCallback`, `useMemo` and `useEffect` went its whole life without
 * either rule, until a stale closure shipped a Quiet toggle that showed quiet
 * and sent loud.
 *
 * So the config is pinned from the outside: ESLint is run programmatically
 * with the real repo configuration over inline fixtures, one per rule. The
 * severities are asserted too, because the split is a decision and not a
 * default — `rules-of-hooks` is an error (every violation is a real bug),
 * `exhaustive-deps` is a warning (a stale closure and a deliberately narrow
 * dependency array look identical to the rule).
 */

/** This file sits at the repo root, beside the config it pins. */
const repoRoot = dirname(fileURLToPath(import.meta.url))

/**
 * The fixture path never exists on disk; ESLint only needs it to pick the
 * matching config block and the TSX parser.
 */
const FIXTURE_PATH = 'react-hooks-canary.tsx'

/** A hook called inside a branch — `rules-of-hooks`, and always a real bug. */
const CONDITIONAL_HOOK_FIXTURE = `import { useState } from 'react'

export function Conditional({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [count] = useState(0)
    return <span>{count}</span>
  }
  return null
}
`

/**
 * The Quiet bug's exact shape, down to the hook: a `useCallback` submit handler
 * reads `muted`, the dependency array does not list it, so the handler keeps
 * dispatching the value it closed over on first render while the switch on
 * screen says otherwise. `useEffect` would report the same warning, but it is
 * not what MAR-2537 was, and a fixture that says "exact" has to be.
 */
const STALE_CLOSURE_FIXTURE = `import { useCallback } from 'react'

export function StaleClosure({
  muted,
  send,
}: {
  muted: boolean
  send: (muted: boolean) => void
}) {
  const handleSubmit = useCallback(() => {
    send(muted)
  }, [send])

  return <button onClick={handleSubmit}>Send</button>
}
`

/** Config resolution is slow enough to matter; loading it once is enough. */
const LINT_TIMEOUT_MS = 60_000

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot })
})

async function lintFixture(source: string) {
  const results = await eslint.lintText(source, { filePath: FIXTURE_PATH })
  return results.flatMap((result) => result.messages)
}

describe('the repo eslint config', () => {
  it(
    'reports a conditionally called hook as an error',
    async () => {
      const messages = await lintFixture(CONDITIONAL_HOOK_FIXTURE)
      const violations = messages.filter(
        (message) => message.ruleId === 'react-hooks/rules-of-hooks',
      )

      expect(violations).toHaveLength(1)
      expect(violations[0].severity).toBe(2)
    },
    LINT_TIMEOUT_MS,
  )

  it(
    'reports a dependency array missing a value the callback reads as a warning',
    async () => {
      const messages = await lintFixture(STALE_CLOSURE_FIXTURE)
      const violations = messages.filter(
        (message) => message.ruleId === 'react-hooks/exhaustive-deps',
      )

      expect(violations).toHaveLength(1)
      expect(violations[0].severity).toBe(1)
      expect(violations[0].message).toContain('muted')
    },
    LINT_TIMEOUT_MS,
  )
})
