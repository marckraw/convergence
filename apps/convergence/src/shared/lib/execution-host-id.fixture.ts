/**
 * One table of ids, driven through every door that decides whether a request
 * names this machine (MAR-2682).
 *
 * Shared rather than copied because a copy is the defect it exists to catch:
 * the rule was read once at the renderer door and once at the main-process one,
 * and the two drifted three times running. Two suites over one table cannot
 * drift the way two tables did — widening either door alone turns a row red in
 * that door's suite.
 *
 * Only values both doors can actually receive. What a non-string does at the
 * door that can be handed one is that door's own question, and is pinned where
 * it is answered.
 */
export const EXECUTION_HOST_REQUEST_CASES: readonly {
  readonly id: string | null | undefined
  readonly thisMachine: boolean
  readonly why: string
}[] = [
  { id: undefined, thisMachine: true, why: 'a caller that names no machine' },
  { id: null, thisMachine: true, why: 'nothing recorded' },
  { id: '', thisMachine: true, why: 'the empty string' },
  { id: 'local', thisMachine: true, why: 'the exact literal' },
  { id: '   ', thisMachine: false, why: 'whitespace is a value, not absence' },
  { id: ' local ', thisMachine: false, why: 'padded local names no machine' },
  { id: 'daemon-a', thisMachine: false, why: 'an Endpoint id' },
  { id: ' daemon-a ', thisMachine: false, why: 'a padded Endpoint id' },
]
