// The canaries' bookkeeping, as pure functions: scripts/canaries.mjs runs each
// check against the bad fixtures in canaries/, and canaries.pure.test.mjs
// checks these (`npm run test:scripts` runs it). Ported from accent.'s
// scripts/canaries.pure.mjs (MAR-3527 there, MAR-3612 here), with ESLint in
// place of Biome and tsc.
//
// A check that stopped firing looks exactly like a check with nothing to
// report. A canary is a fixture that breaks one rule on purpose, and the runner
// fails unless every check fires on its canary, and unless every check has
// one. (Not the Electron lane canary, `npm run test:electron`: that one proves
// the app runs under Electron's patched fs; these prove the checks still see.)

/** A verdict on one check. */
export const FIRED = 'fired'
export const SILENT = 'SILENT'
export const NO_CANARY = 'NO CANARY'

/**
 * The checks a fixture says it trips, from a `canary:` line in its first five
 * lines, in whatever comment the file's language has: `// canary: a, b`,
 * `/* canary: a *\/`, `# canary: a`, `-- canary: a`.
 */
export const canaryHeaderOf = (text) => {
  for (const line of text.split('\n').slice(0, 5)) {
    const match =
      /^\s*(?:\/\/|\/\*|#|--)\s*canary:\s*(.+?)\s*(?:\*\/)?\s*$/.exec(line)
    if (match) {
      return match[1]
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    }
  }
  return []
}

/**
 * A Chaperone result's rule id, without the rule type in front:
 * "forbidden-import/renderer-fsd-public-api-imports" →
 * "renderer-fsd-public-api-imports", "file-pairing/preset/pure-tests-need-source"
 * → "preset/pure-tests-need-source".
 */
export const chaperoneRuleIdOf = (rule) => rule.slice(rule.indexOf('/') + 1)

/**
 * One row per check: did it fire on every fixture that names it? `checks` are
 * the ids that must have a canary; `expectations` are { check, file } pairs
 * from the fixtures; `hits` are the { check, file } pairs the tool reported. A
 * check listed in `coveredElsewhere` (id → where) has its canary in another
 * section. A fixture that names a check nobody runs is a row of its own,
 * SILENT, so a typo can't pass unseen.
 */
export const verdictsOf = ({
  checks,
  expectations,
  hits,
  coveredElsewhere = new Map(),
}) => {
  const fired = new Set(hits.map(({ check, file }) => `${check}\u0000${file}`))
  const rows = []
  for (const check of checks) {
    const canaries = expectations.filter(
      (expectation) => expectation.check === check,
    )
    if (coveredElsewhere.has(check)) {
      rows.push({
        check,
        verdict: FIRED,
        canaries: [coveredElsewhere.get(check)],
        silent: [],
      })
      continue
    }
    if (canaries.length === 0) {
      rows.push({ check, verdict: NO_CANARY, canaries: [], silent: [] })
      continue
    }
    const silent = canaries
      .filter(({ file }) => !fired.has(`${check}\u0000${file}`))
      .map(({ file }) => file)
    rows.push({
      check,
      verdict: silent.length === 0 ? FIRED : SILENT,
      canaries: canaries.map(({ file }) => file),
      silent,
    })
  }
  const known = new Set(checks)
  for (const { check, file } of expectations) {
    if (!known.has(check)) {
      rows.push({
        check,
        verdict: SILENT,
        canaries: [file],
        silent: [file],
        unknown: true,
      })
    }
  }
  return rows
}

/** Whether a Chaperone `extends` entry names a local preset file. */
export const isLocalPreset = (specifier) =>
  specifier.startsWith('./') || specifier.startsWith('../')

/**
 * Where a command rule's canary lives, under canaries/guards: a guard in
 * scripts/guards by its file's name, any other command by its rule id.
 */
export const guardNameOf = (rule) =>
  /^scripts\/guards\/(.+)\.mjs$/.exec(rule.args?.[0] ?? '')?.[1] ?? rule.id

/**
 * The Chaperone config the canaries run with: the repo's own, minus its tool
 * runners (ESLint has a section of its own; tsc and Prettier are not checks a
 * fixture can break) and minus its command rules, whose canaries are folders
 * under canaries/guards. A command rule a preset defines is switched off by a
 * `disabled` entry, the way Chaperone switches off any preset rule.
 * `extendsOf` maps a local preset's specifier to one that resolves from where
 * this config is written.
 */
export const canaryChaperoneConfigOf = ({
  config,
  presetCommandIds,
  extendsOf,
}) => {
  const specifiers =
    typeof config.extends === 'string' ? [config.extends] : config.extends
  const custom = (config.rules?.custom ?? []).filter(
    (rule) => rule.type !== 'command',
  )
  return {
    ...config,
    ...(specifiers
      ? {
          extends: specifiers.map((specifier) =>
            isLocalPreset(specifier) ? extendsOf(specifier) : specifier,
          ),
        }
      : {}),
    rules: {
      ...config.rules,
      typescript: { enabled: false },
      eslint: { enabled: false },
      prettier: { enabled: false },
      custom: [
        ...custom,
        ...presetCommandIds.map((id) => ({
          id,
          type: 'command',
          disabled: true,
        })),
      ],
    },
  }
}

/**
 * The ESLint rules that must each have a canary: every rule the repo's own
 * config blocks name, and not one a preset it spreads brings along (`presets`,
 * the preset blocks themselves), nor one it switches off.
 */
export const eslintChecksOf = (configs, presets) => {
  const checks = new Set()
  for (const config of configs) {
    if (presets.includes(config)) continue
    for (const [rule, setting] of Object.entries(config.rules ?? {})) {
      const level = Array.isArray(setting) ? setting[0] : setting
      if (level === 'off' || level === 0) continue
      checks.add(rule)
    }
  }
  return [...checks]
}

/**
 * ESLint's JSON report as { check, file } hits, the file relative to `base`
 * (an absolute folder, without a trailing slash).
 */
export const eslintHitsOf = (results, base) =>
  results.flatMap((result) => {
    const file = result.filePath.startsWith(`${base}/`)
      ? result.filePath.slice(base.length + 1)
      : result.filePath
    return result.messages
      .filter((message) => message.ruleId)
      .map((message) => ({ check: message.ruleId, file }))
  })

/**
 * Whether a guard fired on its canary: it failed (exit 1) and said each
 * expected thing.
 */
export const guardVerdictOf = ({ status, output, expect }) => {
  const missing = expect.filter((text) => !output.includes(text))
  return {
    verdict: status === 1 && missing.length === 0 ? FIRED : SILENT,
    missing:
      status === 1 ? missing : [`exit code ${status}, not 1`, ...missing],
  }
}

/** The last line: how many checks have a canary, and whether all fired. */
export const summaryOf = (rows) => {
  const total = rows.length
  const canaried = rows.filter((row) => row.verdict !== NO_CANARY).length
  const silent = rows.filter((row) => row.verdict === SILENT).length
  const ok = silent === 0 && canaried === total
  return {
    ok,
    line: `${canaried} of ${total} checks have a canary; ${canaried - silent} fired${silent ? `, ${silent} stayed silent` : ''}${canaried < total ? `, ${total - canaried} have none` : ''}.`,
  }
}
