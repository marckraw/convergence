// Class strings copied a third time, as pure functions: scripts/guards/repeated-classes.mjs reads
// the files its config names, and repeated-classes.pure.test.mjs checks these (`npm run
// test:scripts` runs it). Chaperone runs the guard. It knows nothing about the project it runs in:
// the files, where classes are written, the limits and the allowlist all come from its JSON
// config. Ported from accent. (MAR-3613), where a UI audit found most of its 146 findings were
// copies.
//
// Why: a focus ring, a row or a badge typed out in one feature gets typed again in the next, and
// the copies drift apart. "Duplicate on purpose up to twice; extract on the third use": this finds
// the third use of a class string, so it becomes a part or a shared constant before a fourth copy
// drifts. It reports at severity warning until the design-system sweep (DS4) has fixed today's
// repeats, and becomes an error after.
//
// What counts as a class string: a string literal in a class attribute (`className="…"`, or any
// string inside `className={…}`), any string literal among the arguments of a class function
// (`cn(…)`, `cva(…)`), and every string literal in a class file (`*.styles.ts`). With `constants`
// on, also a string that a declaration or an object's key holds (`const row = '…'`,
// `{ root: '…' }`) in any file, when every word of it reads as a utility (DS8, DLG: a class string
// kept in a plain constant was out of the guard's sight). Two strings are the same when they hold
// the same utilities, in any order. Strings with fewer utilities than the minimum (short ones like
// "flex items-center" repeat for good reason) don't count.

/** The characters after which a `/` starts a regular expression rather than a division. */
// Not <, > or }: in JSX they come before the / of </tag> and />.
const BEFORE_REGEX = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  ';',
  '+',
  '-',
])
const KEYWORD_BEFORE_REGEX =
  /\b(return|typeof|case|in|of|delete|void|yield|await)$/

/**
 * A JavaScript or TypeScript file read as far as strings and comments go. `code` is the text with
 * every comment and every string's contents turned to spaces (lines and offsets stay where they
 * were), so a search in it never lands in either. `strings` are the string literals, in order:
 * where each starts and ends, and its text, or null for a template literal with `${…}` in it.
 */
export const scanSource = (text) => {
  const code = text.split('')
  const strings = []
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (code[i] !== '\n') code[i] = ' '
  }
  // An open `{`: null for code's own, or the template literal whose `${` it is.
  const braces = []
  // Template literals with `${…}`, by where they start: what they hold isn't known until they run.
  const dynamic = new Map()
  let state = 'code'
  let start = 0
  let segment = 0
  let quote = ''
  let previous = ''

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (state === 'line-comment') {
      if (char === '\n') {
        blank(start, i)
        state = 'code'
      }
      continue
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        blank(start, i + 2)
        i += 1
        state = 'code'
      }
      continue
    }
    if (state === 'string') {
      if (char === '\\') i += 1
      else if (char === quote) {
        strings.push({ start, end: i + 1, value: text.slice(start + 1, i) })
        blank(start + 1, i)
        state = 'code'
        previous = 'value'
      } else if (char === '\n') {
        // A quote never spans lines: an apostrophe in JSX text (it's) is no string at all.
        state = 'code'
      }
      continue
    }
    if (state === 'template') {
      if (char === '\\') i += 1
      else if (char === '`') {
        blank(segment, i)
        const record = dynamic.get(start)
        if (record) record.end = i + 1
        else
          strings.push({ start, end: i + 1, value: text.slice(start + 1, i) })
        state = 'code'
        previous = 'value'
      } else if (char === '$' && next === '{') {
        // The expression inside is code: its strings and calls count, the template doesn't.
        blank(segment, i)
        if (!dynamic.has(start)) {
          const record = { start, end: i, value: null }
          dynamic.set(start, record)
          strings.push(record)
        }
        braces.push(start)
        state = 'code'
        i += 1
        previous = '{'
      }
      continue
    }
    if (state === 'regex') {
      if (char === '\\') i += 1
      else if (char === '[') state = 'regex-class'
      else if (char === '/' || char === '\n') {
        state = 'code'
        previous = 'value'
      }
      continue
    }
    if (state === 'regex-class') {
      if (char === '\\') i += 1
      else if (char === ']') state = 'regex'
      continue
    }

    // Code.
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n')
      continue
    if (char === '/' && next === '/') {
      state = 'line-comment'
      start = i
      continue
    }
    if (char === '/' && next === '*') {
      state = 'block-comment'
      start = i
      i += 1
      continue
    }
    if (
      char === '/' &&
      (BEFORE_REGEX.has(previous) ||
        KEYWORD_BEFORE_REGEX.test(text.slice(Math.max(0, i - 7), i).trimEnd()))
    ) {
      state = 'regex'
      continue
    }
    if (char === '"' || char === "'") {
      state = 'string'
      quote = char
      start = i
      continue
    }
    if (char === '`') {
      state = 'template'
      start = i
      segment = i + 1
      continue
    }
    if (char === '{') braces.push(null)
    if (char === '}') {
      const template = braces.pop()
      if (template !== null && template !== undefined) {
        // Back in the template literal the expression belongs to.
        state = 'template'
        start = template
        segment = i + 1
        continue
      }
    }
    previous = /[\w$)\]]/.test(char) ? 'value' : char
  }
  if (state === 'line-comment' || state === 'block-comment')
    blank(start, text.length)
  return { code: code.join(''), strings }
}

/** Where the bracket that opens at `open` in `code` (strings and comments blanked) closes. */
const closingOf = (code, open) => {
  const pairs = { '(': ')', '{': '}', '[': ']' }
  const stack = []
  for (let i = open; i < code.length; i++) {
    const char = code[i]
    if (pairs[char]) stack.push(pairs[char])
    else if (char === ')' || char === '}' || char === ']') {
      if (stack.pop() !== char) return i
      if (stack.length === 0) return i
    }
  }
  return code.length
}

const escapeRegex = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The 1-based line of each offset in `text`. */
const lineOf = (text) => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (offset) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (starts[middle] <= offset) low = middle
      else high = middle - 1
    }
    return low + 1
  }
}

/** Words that are utilities on their own, with no dash or variant to give them away. */
const BARE_UTILITIES = new Set(
  'flex grid block inline hidden contents table truncate relative absolute fixed sticky static isolate uppercase lowercase capitalize italic underline rounded border shadow outline ring transition grow shrink invisible visible container antialiased'.split(
    ' ',
  ),
)

/**
 * Whether a string reads as a class string: every word a utility (a dash, a variant's colon or an
 * arbitrary value's bracket in it, or one of the bare utilities), in the lower case utilities are
 * written in. A sentence ("Couldn't save the project.") never does.
 */
export const looksLikeClasses = (value) => {
  const words = value.trim().split(/\s+/)
  return (
    words.length > 0 &&
    words.every(
      (word) =>
        /^!?-?[a-z0-9@[\]_&>*:./()%#=,+-]+$/.test(word) &&
        (/[-:[]/.test(word) || BARE_UTILITIES.has(word)),
    )
  )
}

/**
 * The class strings in one file's text, each with its line: string literals in a class attribute
 * (`attributes`, such as className), among a class function's arguments (`functions`, such as cn
 * and cva), or, when `wholeFile` is set (a *.styles.ts file), every string literal in it. With
 * `constants`, also a string a declaration or an object's key holds, when it reads as classes.
 * Template literals with `${…}` in them are left out: what they hold isn't known until they run.
 */
export const classStringsOf = (
  text,
  { attributes = [], functions = [], wholeFile = false, constants = false },
) => {
  const { code, strings } = scanSource(text)
  const spans = []
  if (wholeFile) spans.push([0, text.length])
  if (constants && !wholeFile)
    for (const string of strings) {
      if (string.value === null || !looksLikeClasses(string.value)) continue
      // What stands before it: `name =` (a declaration's value) or `key:` (an object's).
      const before = code.slice(Math.max(0, string.start - 120), string.start)
      if (
        /(?:\b(?:const|let|var)\s+[\w$]+\s*(?::[^=\n]+)?=|[{,]\s*(?:[\w$]+|['"][^'"\n]*['"])\s*:)\s*$/.test(
          before,
        )
      )
        spans.push([string.start, string.start])
    }
  if (attributes.length > 0) {
    const attribute = new RegExp(
      `\\b(?:${attributes.map(escapeRegex).join('|')})\\s*=\\s*`,
      'g',
    )
    for (const match of code.matchAll(attribute)) {
      const at = match.index + match[0].length
      if (code[at] === '{') spans.push([at, closingOf(code, at)])
      else spans.push([at, at + 1])
    }
  }
  if (functions.length > 0) {
    const call = new RegExp(
      `(?<![\\w$.])(?:${functions.map(escapeRegex).join('|')})\\s*\\(`,
      'g',
    )
    for (const match of code.matchAll(call)) {
      const at = match.index + match[0].length - 1
      spans.push([at, closingOf(code, at)])
    }
  }
  const line = lineOf(text)
  return strings
    .filter((string) => string.value !== null)
    .filter((string) =>
      spans.some(([from, to]) => string.start >= from && string.start <= to),
    )
    .map((string) => ({ classes: string.value, line: line(string.start) }))
}

/** A class string's utilities, one of each, sorted: two strings with the same key are copies. */
export const classKeyOf = (classes) =>
  [...new Set(classes.trim().split(/\s+/))].toSorted().join(' ')

/**
 * Every class string that appears more often than `maxOccurrences`, across `sources` (each
 * { path, text, wholeFile }), with where each copy is. Strings with fewer than `minUtilities`
 * utilities don't count; allowlisted ones ({ classes, reason }, in any order) are left out, and an
 * allowlist entry that no longer matches more copies than allowed is reported, so the list stays
 * true.
 */
export const repeatedClasses = ({ sources, config }) => {
  const {
    attributes,
    functions,
    constants,
    minUtilities,
    maxOccurrences,
    allowlist = [],
  } = config
  const places = new Map()
  for (const { path, text, wholeFile } of sources) {
    for (const { classes, line } of classStringsOf(text, {
      attributes,
      functions,
      wholeFile,
      constants,
    })) {
      const key = classKeyOf(classes)
      if (key.split(' ').length < minUtilities) continue
      if (!places.has(key))
        places.set(key, {
          classes: classes.trim().replace(/\s+/g, ' '),
          at: [],
        })
      places.get(key).at.push(`${path}:${line}`)
    }
  }
  const allowed = new Set(allowlist.map((entry) => classKeyOf(entry.classes)))
  const repeats = [...places.entries()]
    .filter(([key, { at }]) => at.length > maxOccurrences && !allowed.has(key))
    .map(([, { classes, at }]) => ({ classes, at }))
    .toSorted(
      (a, b) => b.at.length - a.at.length || a.classes.localeCompare(b.classes),
    )
  const stale = allowlist
    .filter(
      (entry) =>
        (places.get(classKeyOf(entry.classes))?.at.length ?? 0) <=
        maxOccurrences,
    )
    .map((entry) => entry.classes)
  return { repeats, stale }
}

/** What the guard prints: one line per repeated string, and one per stale allowlist entry. */
export const repeatedClassProblems = (
  { repeats, stale },
  { maxOccurrences },
) => [
  ...repeats.map(
    ({ classes, at }) =>
      `"${classes}": ${at.length} copies, at most ${maxOccurrences}: ${at.join(', ')}`,
  ),
  ...stale.map(
    (classes) =>
      `"${classes}": allowlisted, but no longer copied more than ${maxOccurrences} times: take it off the allowlist`,
  ),
]

/** What's wrong with a config, as sentences: [] when the guard can run with it. */
export const configProblems = (config) => {
  const problems = []
  const strings = (value) =>
    Array.isArray(value) && value.every((v) => typeof v === 'string')
  if (!strings(config.files) || config.files.length === 0)
    problems.push('files: a list of globs, at least one')
  for (const field of ['exclude', 'classFiles', 'attributes', 'functions']) {
    if (config[field] !== undefined && !strings(config[field]))
      problems.push(`${field}: a list of strings`)
  }
  if (config.constants !== undefined && typeof config.constants !== 'boolean')
    problems.push('constants: true or false')
  for (const field of ['minUtilities', 'maxOccurrences']) {
    if (!Number.isInteger(config[field]) || config[field] < 1)
      problems.push(`${field}: a whole number, 1 or more`)
  }
  const entries = config.allowlist ?? []
  if (!Array.isArray(entries))
    problems.push('allowlist: a list of { classes, reason }')
  else
    entries.forEach((entry, index) => {
      if (
        typeof entry?.classes !== 'string' ||
        typeof entry?.reason !== 'string' ||
        !entry.reason
      )
        problems.push(`allowlist[${index}]: needs classes and a reason`)
    })
  return problems
}
