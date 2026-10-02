// Sizes handed to a part through a constant, as pure functions: scripts/guards/sizes-in-constants.mjs
// reads the files its config names, and sizes-in-constants.pure.test.mjs checks these (`npm run
// test:scripts` runs it). Chaperone runs the guard (MAR-3608, DS8).
//
// Why: R3 says a size is a prop, never a className, and the drift rules `use-button-sizes`,
// `no-buttons-as-rows` and `use-part-sizes` enforce it on what a tag's className says in place. A
// regex reads text, not code, so a size moved into a constant (`styles.item`, `PILL`, a
// `pickRowClass(selected)` that returns one) passed all three: the 2 Oct audit found thirteen such
// constants, three of them added by the sweep that widened the rules. This guard follows the names a
// part's className uses to what they hold, through the file's own declarations and its relative and
// `@/` imports, and reads the utilities there with the same patterns.
//
// What it reads, per configured part (a tag and the attributes that hand it classes):
// - a name (`PILL`), a member (`styles.item`, `toneClass[tone]`: every value of the object when
//   the key is computed) or a call (`pickRowClass(selected)`: the function's body), followed into
//   the declaration that holds it and every name inside that, wherever it was imported from;
// - for a wrapper (a component that hands its className to a part, such as LoomTitleView), the
//   strings written in place too, since the drift rules read only the parts' own tags.
// What it leaves to the regex rules: the strings written in place on a part's own tag.
// A utility behind a variant (`hover:px-2`, `[&_svg]:size-4`) is not the part's size.

import { scanSource } from './repeated-classes.pure.mjs'

const escapeRegex = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The 1-based line of an offset in `text`. */
export const lineOfOffset = (text, offset) => {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++)
    if (text[i] === '\n') line += 1
  return line
}

/** Where the bracket that opens at `open` in `code` (strings and comments blanked) closes. */
export const closingOf = (code, open) => {
  const pairs = { '(': ')', '{': '}', '[': ']' }
  const stack = []
  for (let i = open; i < code.length; i++) {
    const char = code[i]
    if (pairs[char]) stack.push(pairs[char])
    else if (char === ')' || char === '}' || char === ']') {
      stack.pop()
      if (stack.length === 0) return i
    }
  }
  return code.length
}

const CONTINUES_LINE = /[=,([{?:+\-*|&.]$/
const CONTINUES_FROM = /^[.?:+\-*|&)\]}]/

/**
 * Where an expression that starts at `from` ends: at a newline outside every bracket, when the
 * line doesn't end with an operator and the next doesn't start with one (Prettier's code has no
 * semicolons), or at a `;`, or, inside an object literal, at the `,` or `}` that ends its value.
 */
export const expressionEnd = (code, from) => {
  let depth = 0
  let i = from
  while (i < code.length && /\s/.test(code[i])) i++
  for (; i < code.length; i++) {
    const char = code[i]
    if (char === '(' || char === '[' || char === '{') depth++
    else if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) return i
      depth--
    } else if (depth === 0 && (char === ';' || char === ',')) return i
    else if (depth === 0 && char === '\n') {
      const before = code.slice(from, i).trimEnd()
      const after = code.slice(i + 1).trimStart()
      // An arrow's body on the next line belongs to it.
      if (before.endsWith('=>')) continue
      if (!CONTINUES_LINE.test(before) && !CONTINUES_FROM.test(after)) return i
    }
  }
  return code.length
}

/** A file's names: what it declares (with where its value is), and what it imports from where. */
export const moduleOf = (text) => {
  const { code, strings } = scanSource(text)
  const declarations = new Map()
  const declare = (name, start, from, to) => {
    if (!declarations.has(name)) declarations.set(name, [])
    const lineStart = code.lastIndexOf('\n', start - 1) + 1
    const topLevel = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?$/.test(
      code.slice(lineStart, start),
    )
    declarations.get(name).push({ start, from, to, topLevel })
  }
  for (const match of code.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=(?!=|>)/g,
  )) {
    const from = match.index + match[0].length
    declare(match[1], match.index, from, expressionEnd(code, from))
  }
  for (const match of code.matchAll(
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g,
  )) {
    const open = code.indexOf(
      '{',
      closingOf(code, match.index + match[0].length - 1),
    )
    if (open === -1) continue
    declare(match[1], match.index, open, closingOf(code, open))
  }
  const imports = new Map()
  for (const match of code.matchAll(
    /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*(['"])/g,
  )) {
    const source = strings.find(
      (string) => string.start === match.index + match[0].length - 1,
    )
    if (!source) continue
    for (const part of match[1].split(',')) {
      const [imported, local = imported] = part
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)
        .map((word) => word.trim())
      if (local) imports.set(local, { source: source.value, imported })
    }
  }
  const reexports = []
  for (const match of code.matchAll(
    /\bexport\s+(?:type\s+)?(\*|\{([^}]*)\})\s*from\s*(['"])/g,
  )) {
    const source = strings.find(
      (string) => string.start === match.index + match[0].length - 1,
    )
    if (!source) continue
    if (match[1] === '*') reexports.push({ source: source.value, names: null })
    else
      reexports.push({
        source: source.value,
        names: new Map(
          match[2]
            .split(',')
            .map((part) =>
              part
                .replace(/^\s*type\s+/, '')
                .split(/\s+as\s+/)
                .map((word) => word.trim()),
            )
            .filter(([name]) => name)
            .map(([name, as = name]) => [as, name]),
        ),
      })
  }
  return { text, code, strings, declarations, imports, reexports }
}

/** The static text of a string literal: a template's `${…}` parts are left out. */
const staticTextOf = (text, string) =>
  string.value ??
  text.slice(string.start + 1, string.end - 1).replace(/\$\{[^}]*\}/g, ' ')

/** The names a stretch of code uses: `a`, `a.b`, `a[b]`, `a(…)`, never a key or a member alone. */
export const namesIn = (code, from, to) => {
  const names = []
  const stretch = code.slice(from, to)
  for (const match of stretch.matchAll(
    /(?<![\w$.]|\?\.)([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)*)(\s*\[|\s*\()?/g,
  )) {
    const after = stretch.slice(match.index + match[0].length).trimStart()
    // An object's key or a JSX attribute's name, not a use.
    if (
      !match[3] &&
      /^:(?!:)/.test(after) &&
      !/\?\s*$/.test(stretch.slice(0, match.index))
    )
      continue
    if (!match[3] && /^=(?![=>])/.test(after)) continue
    names.push({
      name: match[1],
      members: match[2] ? match[2].slice(1).split('.') : [],
      computed: /\[/.test(match[3] ?? ''),
      at: from + match.index,
    })
  }
  return names
}

const KEYWORDS = new Set(
  'true false null undefined this new typeof void return if else const let var function as in of await async'.split(
    ' ',
  ),
)

/**
 * Where the value of `key` in the object literal that opens at `open` is, or null: its entries
 * walked one by one, a quoted key read from the text (`code` holds its quotes, blanked).
 */
const propertyRange = (module, open, key) => {
  const { code, strings } = module
  const close = closingOf(code, open)
  let i = open + 1
  while (i < close) {
    while (i < close && /\s/.test(code[i])) i++
    let name = null
    let after = i
    const word = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, close))
    if (word) {
      name = word[0]
      after = i + word[0].length
    } else if (code[i] === "'" || code[i] === '"') {
      const string = strings.find((candidate) => candidate.start === i)
      if (string) {
        name = string.value
        after = string.end
      }
    }
    const colon = /^\s*:/.exec(code.slice(after, close))
    if (name !== null && colon) {
      const from = after + colon[0].length
      const to = expressionEnd(code, from)
      if (name === key) return { from, to }
      i = to + 1
    } else {
      // A spread, a method or a computed key: to the next entry.
      i = expressionEnd(code, i) + 1
    }
  }
  return null
}

/** Whether a string literal is an object's key: after `{` or `,`, before `:`. */
const isKey = (code, string) =>
  /[{,]\s*$/.test(code.slice(Math.max(0, string.start - 200), string.start)) &&
  /^\s*:/.test(code.slice(string.end, string.end + 20))

/**
 * Follows a name to what it holds: each string literal inside its declaration (and inside the
 * declarations of the names it uses, as far as they go), with the name it is declared under in
 * its own file and where it is. `resolve(fromPath, source)` turns an import's source into a path
 * the `modules` map knows, or null for a package.
 */
export const classesBehind = (
  { modules, resolve },
  path,
  use,
  seen = new Set(),
) => {
  const found = []
  const module = modules.get(path)
  if (!module || KEYWORDS.has(use.name)) return found
  const key = `${path}#${use.name}.${use.members.join('.')}${use.computed ? '[]' : ''}`
  if (seen.has(key)) return found
  seen.add(key)

  const all = module.declarations.get(use.name) ?? []
  // A use in the file sees the last declaration before it; an import sees the module's own.
  const declaration =
    use.at < 0
      ? (all.find((candidate) => candidate.topLevel) ?? all.at(0))
      : (all.filter((candidate) => candidate.start <= use.at).at(-1) ??
        all.find((candidate) => candidate.topLevel))
  if (declaration) {
    let { from, to } = declaration
    const named = [use.name]
    // obj.key: the key's value, when the object is written out.
    for (const member of use.members) {
      const open = module.code.slice(from, to).search(/\S/)
      if (open === -1 || module.code[from + open] !== '{') break
      const range = propertyRange(module, from + open, member)
      if (!range) return found
      ;({ from, to } = range)
      named.push(member)
    }
    for (const string of module.strings) {
      if (string.start < from || string.start >= to) continue
      if (isKey(module.code, string)) continue
      found.push({
        classes: staticTextOf(module.text, string),
        name: named.join('.'),
        path,
        line: lineOfOffset(module.text, string.start),
      })
    }
    for (const inner of namesIn(module.code, from, to))
      found.push(...classesBehind({ modules, resolve }, path, inner, seen))
    return found
  }

  const imported = module.imports.get(use.name)
  if (imported) {
    const target = resolve(path, imported.source)
    if (!target) return found
    return exportedClasses(
      { modules, resolve },
      target,
      { ...use, name: imported.imported, at: -1 },
      seen,
    )
  }
  return found
}

/** What a module exports under `use.name`, followed through `export … from`. */
const exportedClasses = ({ modules, resolve }, path, use, seen) => {
  const module = modules.get(path)
  if (!module) return []
  if (module.declarations.has(use.name))
    return classesBehind({ modules, resolve }, path, use, seen)
  for (const reexport of module.reexports) {
    const original = reexport.names ? reexport.names.get(use.name) : use.name
    if (!original) continue
    const target = resolve(path, reexport.source)
    if (!target) continue
    const found = exportedClasses(
      { modules, resolve },
      target,
      { ...use, name: original },
      seen,
    )
    if (found.length > 0 || reexport.names) return found
  }
  return []
}

/** The JSX tags named `tags` in a file, each with its attributes' expression ranges. */
export const partUsesOf = (module, { tags, attributes }) => {
  const { code } = module
  const uses = []
  // "*" is any component: a prop such as triggerClassName means the same on every one.
  const names = tags.map((tag) =>
    tag === '*' ? '[A-Z][\\w.]*' : escapeRegex(tag),
  )
  const tag = new RegExp(`<(${names.join('|')})\\b`, 'g')
  for (const match of code.matchAll(tag)) {
    // The rest of the tag: up to the `>` that isn't an arrow's, outside every bracket.
    let end = match.index + match[0].length
    let depth = 0
    for (; end < code.length; end++) {
      const char = code[end]
      if (char === '{' || char === '(') depth++
      else if (char === '}' || char === ')') depth--
      else if (char === '>' && depth === 0 && code[end - 1] !== '=') break
    }
    const inside = code.slice(match.index, end)
    // The tag's own attribute, not one of a tag inside a prop (icon={<Zap className=… />}).
    const depthAt = (offset) => {
      let depth = 0
      for (let i = 0; i < offset; i++) {
        if (inside[i] === '{' || inside[i] === '(') depth++
        else if (inside[i] === '}' || inside[i] === ')') depth--
      }
      return depth
    }
    for (const attribute of attributes) {
      const found = [
        ...inside.matchAll(new RegExp(`\\s${escapeRegex(attribute)}=`, 'g')),
      ].find((candidate) => depthAt(candidate.index) === 0)
      if (!found) continue
      const at = match.index + found.index + found[0].length
      const range =
        code[at] === '{'
          ? { from: at + 1, to: closingOf(code, at) }
          : { from: at, to: at + 1 + code.slice(at + 1).search(/["']/) + 1 }
      uses.push({
        tag: match[1],
        attribute,
        at: match.index,
        link: /\svariant=["']link["']/.test(
          module.text.slice(match.index, end),
        ),
        ...range,
      })
    }
  }
  return uses
}

/** A utility the part's own pattern forbids, or null; one behind a variant never counts. */
const forbiddenIn = (classes, pattern) =>
  classes
    .split(/\s+/)
    .filter((utility) => utility && !utility.includes(':'))
    .filter((utility) => pattern.test(utility.replace(/^!/, '')))

/**
 * Every size a part is handed through a name, in every source ({ path, text }). `config.parts` is a
 * list of { tags, attributes, pattern, linkPattern?, inPlace? }: `pattern` is a regular expression
 * for a whole utility; `linkPattern`, if given, replaces it on a `variant="link"` Button (a link has
 * no box, so only a fixed width or height counts); `inPlace` reads the strings written in the
 * attribute too (for a wrapper the drift rules can't see). `allowlist` entries ({ path, name,
 * utilities, reason }) keep a constant's sizes on purpose; one that matches nothing is reported.
 */
export const sizesInConstants = ({ sources, config, resolve }) => {
  const modules = new Map(
    sources.map(({ path, text }) => [path, moduleOf(text)]),
  )
  const problems = []
  for (const { path } of sources) {
    if (!path.endsWith('.tsx')) continue
    const module = modules.get(path)
    for (const part of config.parts) {
      const pattern = new RegExp(`^(?:${part.pattern})$`)
      const linkPattern = part.linkPattern
        ? new RegExp(`^(?:${part.linkPattern})$`)
        : pattern
      for (const use of partUsesOf(module, part)) {
        const strings = []
        if (part.inPlace)
          for (const string of module.strings)
            if (string.start >= use.from - 1 && string.start < use.to)
              strings.push({
                classes: staticTextOf(module.text, string),
                name: null,
                path,
                line: lineOfOffset(module.text, string.start),
              })
        const seen = new Set()
        for (const name of namesIn(module.code, use.from, use.to))
          strings.push(
            ...classesBehind({ modules, resolve }, path, name, seen).map(
              (string) => ({
                ...string,
                shown: [name.name, ...name.members].join('.'),
              }),
            ),
          )
        for (const string of strings) {
          const utilities = forbiddenIn(
            string.classes,
            use.link ? linkPattern : pattern,
          )
          if (utilities.length === 0) continue
          problems.push({
            path,
            line: lineOfOffset(module.text, use.at),
            tag: use.tag,
            attribute: use.attribute,
            utilities,
            shown: string.shown ?? null,
            name: string.name,
            from: `${string.path}:${string.line}`,
            fromPath: string.path,
          })
        }
      }
    }
  }
  const allowlist = config.allowlist ?? []
  const used = new Set()
  const kept = problems.filter((problem) => {
    const index = allowlist.findIndex(
      (entry) =>
        entry.path === problem.fromPath &&
        entry.name === problem.name &&
        problem.utilities.every((utility) => entry.utilities.includes(utility)),
    )
    if (index === -1) return true
    used.add(index)
    return false
  })
  const unique = new Map()
  for (const problem of kept) {
    const key = `${problem.path}:${problem.line}:${problem.attribute}:${problem.from}:${problem.utilities.join(' ')}`
    unique.set(key, problem)
  }
  return {
    problems: [...unique.values()].toSorted(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        a.line - b.line ||
        a.from.localeCompare(b.from),
    ),
    stale: allowlist.filter((_, index) => !used.has(index)),
  }
}

/** What the guard prints: one line per size handed through a name, and one per stale entry. */
export const sizeProblems = ({ problems, stale }) => [
  ...problems.map(
    ({ path, line, tag, attribute, utilities, shown, from }) =>
      `${path}:${line}: <${tag}> ${attribute} gets "${utilities.join(' ')}" ${
        shown ? `from ${shown}` : 'written in place'
      } (${from})`,
  ),
  ...stale.map(
    (entry) =>
      `${entry.path}: ${entry.name} is allowlisted for "${entry.utilities.join(' ')}", but no part gets them from it any more: take it off the allowlist`,
  ),
]

/** Resolves an import's source to a file path among `paths`, by the config's aliases; null for a package. */
export const resolverFor = (paths, aliases = {}) => {
  const known = new Set(paths)
  const join = (base, relativePath) => {
    const parts = base.split('/')
    for (const part of relativePath.split('/')) {
      if (part === '.' || part === '') continue
      if (part === '..') parts.pop()
      else parts.push(part)
    }
    return parts.join('/')
  }
  return (fromPath, source) => {
    let base = null
    if (source.startsWith('.'))
      base = join(fromPath.split('/').slice(0, -1).join('/'), source)
    else
      for (const [alias, target] of Object.entries(aliases))
        if (source.startsWith(alias))
          base = join(target.replace(/\/$/, ''), source.slice(alias.length))
    if (base === null) return null
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ])
      if (known.has(candidate)) return candidate
    return null
  }
}

/** What's wrong with a config, as sentences: [] when the guard can run with it. */
export const configProblems = (config) => {
  const problems = []
  const strings = (value) =>
    Array.isArray(value) && value.every((v) => typeof v === 'string')
  if (!strings(config.files) || config.files.length === 0)
    problems.push('files: a list of globs, at least one')
  if (config.exclude !== undefined && !strings(config.exclude))
    problems.push('exclude: a list of strings')
  if (!Array.isArray(config.parts) || config.parts.length === 0)
    problems.push('parts: a list of { tags, attributes, pattern }')
  else
    config.parts.forEach((part, index) => {
      if (
        !strings(part.tags) ||
        !strings(part.attributes) ||
        typeof part.pattern !== 'string'
      )
        problems.push(`parts[${index}]: needs tags, attributes and a pattern`)
      else
        try {
          new RegExp(part.pattern)
          if (part.linkPattern !== undefined) new RegExp(part.linkPattern)
        } catch (error) {
          problems.push(`parts[${index}]: ${error.message}`)
        }
    })
  const entries = config.allowlist ?? []
  if (!Array.isArray(entries))
    problems.push('allowlist: a list of { path, name, utilities, reason }')
  else
    entries.forEach((entry, index) => {
      if (
        typeof entry?.path !== 'string' ||
        typeof entry?.name !== 'string' ||
        !strings(entry?.utilities) ||
        typeof entry?.reason !== 'string' ||
        !entry.reason
      )
        problems.push(
          `allowlist[${index}]: needs path, name, utilities and a reason`,
        )
    })
  return problems
}
