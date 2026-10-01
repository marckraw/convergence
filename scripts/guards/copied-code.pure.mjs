// Copied code, as jscpd reports it, as pure functions: scripts/guards/copied-code.mjs runs jscpd
// with the project's .jscpd.json and reads its JSON report, and copied-code.pure.test.mjs checks
// these (`npm run test:scripts` runs it). Chaperone runs the guard. It knows nothing about the
// project: what to read, what to leave out and how long a copy has to be all come from
// .jscpd.json. Ported from accent. (MAR-3613).
//
// Why: whole parts get pasted from one feature into the next (a header, a filter bar, a list's
// empty state), each then changed a little, so the copies drift apart. repeated-classes catches a
// class string's third copy; this catches a pasted component's second, since a copy that long is
// never an accident of style. It reports at severity warning until the design-system sweep (DS4)
// has fixed today's copies, and becomes an error after.
//
// Every clone jscpd reports (minTokens and minLines long, or more) is a problem. A copy kept on
// purpose is either marked in the code, between `jscpd:ignore-start` and `jscpd:ignore-end`
// comments that say why, or named in the guard's allowlist (copied-code.json beside it): the two
// files, and the reason. An allowlist entry that no longer matches a clone is reported, so the
// list never outlives what it excused. The config's threshold caps the share of copied lines too.

/** A place in jscpd's report as `path:start-end`. */
const placeOf = (file) => `${file.name}:${file.start}-${file.end}`

/** The two files of a clone, or of an allowlist entry, in one order: a pair's key. */
const pairOf = (a, b) => [a, b].toSorted().join('\u0000')

/**
 * What the guard prints for a jscpd JSON report: one line per clone, the longest first, and one
 * if the share of copied lines is over `threshold` (a percentage; none when it's undefined).
 * Clones between two files the allowlist names ({ files: [a, b], reason }, in either order) are
 * left out, and an entry that matches no clone is reported.
 */
export const copiedCodeProblems = ({ report, threshold, allowlist = [] }) => {
  const allowed = new Set(allowlist.map((entry) => pairOf(...entry.files)))
  const duplicates = report.duplicates ?? []
  const pairs = new Set(
    duplicates.map((clone) =>
      pairOf(clone.firstFile.name, clone.secondFile.name),
    ),
  )
  const clones = duplicates
    .filter(
      (clone) =>
        !allowed.has(pairOf(clone.firstFile.name, clone.secondFile.name)),
    )
    .toSorted(
      (a, b) =>
        b.tokens - a.tokens ||
        placeOf(a.firstFile).localeCompare(placeOf(b.firstFile)),
    )
    .map(
      (clone) =>
        `${placeOf(clone.firstFile)} and ${placeOf(clone.secondFile)}: ${clone.lines} lines (${clone.tokens} tokens) copied`,
    )
  const stale = allowlist
    .filter((entry) => !pairs.has(pairOf(...entry.files)))
    .map(
      (entry) =>
        `${entry.files.join(' and ')}: allowlisted, but no longer a copy: take it off the allowlist`,
    )
  const share = report.statistics?.total?.percentage ?? 0
  const over =
    typeof threshold === 'number' && share > threshold
      ? [
          `${share.toFixed(2)}% of the lines are copies, over the threshold of ${threshold}%`,
        ]
      : []
  return [...clones, ...stale, ...over]
}

/** What's wrong with an allowlist, as sentences: [] when the guard can run with it. */
export const allowlistProblems = (allowlist) => {
  if (!Array.isArray(allowlist))
    return ['allowlist: a list of { files: [a, b], reason }']
  return allowlist.flatMap((entry, index) =>
    Array.isArray(entry?.files) &&
    entry.files.length === 2 &&
    entry.files.every((file) => typeof file === 'string') &&
    typeof entry.reason === 'string' &&
    entry.reason !== ''
      ? []
      : [`allowlist[${index}]: needs files (two paths) and a reason`],
  )
}

/** The jscpd arguments the guard runs with: the config, a JSON report into `output`, and `.`. */
export const jscpdArgsOf = ({ config, output }) => [
  '--config',
  config,
  '--reporters',
  'json',
  '--output',
  output,
  '--silent',
  '--no-tips',
  '--no-colors',
  // The guard decides from the report; jscpd's own exit code would also fail on its errors.
  '--exit-code',
  '0',
  '.',
]
