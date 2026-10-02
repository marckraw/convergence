#!/usr/bin/env node
// DS5a, the lock (MAR-3618): the app and the design system stop writing the
// names Tailwind's defaults and shadcn's legacy bridge gave them, so theme.css
// can switch both off. Run from the repo root:
//
//   node packages/ui/tools/codemods/ds5-legacy-names.mjs --phase names          (dry run: report)
//   node packages/ui/tools/codemods/ds5-legacy-names.mjs --phase names --write  (rewrite files)
//   node packages/ui/tools/codemods/ds5-legacy-names.mjs --phase reset --write
//
// then Prettier. It reads apps/convergence/src and packages/ui/src (stories
// and tests included), leaving out the token files themselves (tokens.css
// and theme.css keep their "was …" history by hand).
//
// Phase `names`: the shadcn names the legacy bridge served, onto the token
// names (the DS2 plan's §14 table). A utility keeps its variants and its
// opacity modifier (`hover:bg-card/40` -> `hover:bg-surface/40`), except
// where the plan names a token for the pair (all exact unless marked):
//
//   background -> canvas          card -> surface        popover -> raised
//   foreground, card-foreground, popover-foreground -> ink
//   secondary-foreground -> ink (light 0.205 -> 0.145, the plan's one delta)
//   muted-foreground -> ink-muted  muted, secondary -> surface-muted
//   sidebar -> surface-sunken      primary -> strong      primary-foreground -> on-strong
//   accent -> highlight            accent-foreground -> on-highlight
//   border -> line; border/60, /70, /80 -> line-soft (/60 and /80 fold, decision 9)
//   control-border -> control-line input -> control-fill ring -> focus
//   destructive: /10 -> danger-soft, /40 -> danger-line, text -> danger-ink
//     (light 0.55 -> 0.51, the plan's §15), a fill or a line -> danger-solid
//   destructive-foreground -> on-danger
//   warning-foreground -> warning-ink
//   warning: /10 -> warning-soft, /30 -> warning-line, /5 -> warning-soft/50;
//     any other warning is refused and listed (no token draws it exactly)
//   popover/95 as a fill -> glass (the tooltip's surface, R8)
//
// and the same names as raw custom properties: var(--ring) -> var(--focus) …
//
// Phase `reset`: the Tailwind defaults the reset switches off that the app
// still writes, onto the elevation tokens:
//
//   shadow (bare), shadow-sm -> shadow-control   shadow-md -> shadow-raised
//   shadow-xl -> shadow-floating                  shadow-2xl -> shadow-overlay
//   shadow-lg -> shadow-raised (one step lower: R8, hand-built popups)
//   shadow-xs, shadow-2xs -> shadow-control (one step higher)
//
// The mapping is exported (`mapClass`) so the equivalence check renames the
// old build's selectors with the same table it proves.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const UTILITIES = [
  'ring-offset',
  'border-x',
  'border-y',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-s',
  'border-e',
  'border',
  'bg',
  'text',
  'ring',
  'outline',
  'divide',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'shadow',
  'decoration',
  'caret',
  'placeholder',
]

// Longest first, so `card-foreground` is never read as `card`.
const LEGACY = [
  'destructive-foreground',
  'secondary-foreground',
  'popover-foreground',
  'primary-foreground',
  'accent-foreground',
  'muted-foreground',
  'warning-foreground',
  'card-foreground',
  'control-border',
  'background',
  'foreground',
  'destructive',
  'secondary',
  'popover',
  'primary',
  'sidebar',
  'warning',
  'accent',
  'border',
  'muted',
  'input',
  'card',
  'ring',
]

/** One name for one name: every utility, every modifier. */
const PLAIN = {
  background: 'canvas',
  foreground: 'ink',
  'card-foreground': 'ink',
  'popover-foreground': 'ink',
  'secondary-foreground': 'ink',
  'muted-foreground': 'ink-muted',
  card: 'surface',
  muted: 'surface-muted',
  secondary: 'surface-muted',
  sidebar: 'surface-sunken',
  primary: 'strong',
  'primary-foreground': 'on-strong',
  accent: 'highlight',
  'accent-foreground': 'on-highlight',
  'control-border': 'control-line',
  input: 'control-fill',
  ring: 'focus',
  'destructive-foreground': 'on-danger',
  'warning-foreground': 'warning-ink',
}

/** Raw custom properties: the bridge's aliases, followed to their tokens. */
const VARIABLES = {
  ...PLAIN,
  'secondary-foreground': 'strong',
  popover: 'raised',
  border: 'line',
  destructive: 'danger-solid',
}

const ALPHA = String.raw`(?:/(\d+(?:\.\d+)?|\[[^\]\s'"\x60]+\]))?`
const NAME_PATTERN = new RegExp(
  String.raw`(?<![\w-])(${UTILITIES.join('|')})-(${LEGACY.join('|')})${ALPHA}(?![\w-])`,
  'g',
)
const VARIABLE_PATTERN = new RegExp(
  String.raw`var\(--(${Object.keys(VARIABLES)
    .sort((a, b) => b.length - a.length)
    .join('|')})(?=[\s,)])`,
  'g',
)

/**
 * The token utility for a legacy utility, or null when no token draws it
 * (the codemod lists it and leaves it).
 */
export function mapLegacy(utility, name, alpha) {
  const keep = (token) => `${utility}-${token}${alpha ? `/${alpha}` : ''}`
  if (name in PLAIN) return keep(PLAIN[name])
  switch (name) {
    case 'popover':
      return utility === 'bg' && alpha === '95' ? 'bg-glass' : keep('raised')
    case 'border':
      return ['60', '70', '80'].includes(alpha)
        ? `${utility}-line-soft`
        : keep('line')
    case 'destructive':
      if (alpha === '10') return `${utility}-danger-soft`
      if (alpha === '40') return `${utility}-danger-line`
      return keep(utility === 'text' ? 'danger-ink' : 'danger-solid')
    case 'warning':
      if (alpha === '10') return `${utility}-warning-soft`
      if (alpha === '30') return `${utility}-warning-line`
      if (alpha === '5') return `${utility}-warning-soft/50`
      return null
    default:
      return null
  }
}

const SHADOWS = {
  '': 'shadow-control',
  '2xs': 'shadow-control',
  xs: 'shadow-control',
  sm: 'shadow-control',
  md: 'shadow-raised',
  lg: 'shadow-raised',
  xl: 'shadow-floating',
  '2xl': 'shadow-overlay',
}
const SHADOW_PATTERN = /(?<![\w-])shadow-(2xs|xs|sm|md|lg|xl|2xl)(?![\w/-])/g
// Bare `shadow` is also an English word: it is rewritten only as one class
// among others in a quoted class string.
const QUOTED = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g
const BARE_SHADOW = /(?<=^|\s)shadow(?=\s|$)/g
const LOOKS_LIKE_CLASSES = /(?:^|\s)[a-z][\w:-]*-[\w/.[\]-]+(?:\s|$)/

/**
 * One class token (variants and all) as the given phases rewrite it; the
 * equivalence check renames the old build's selectors with this.
 */
export function mapClass(token, phases = ['names', 'reset']) {
  let out = token
  if (phases.includes('names'))
    out = out.replace(
      NAME_PATTERN,
      (whole, utility, name, alpha) => mapLegacy(utility, name, alpha) ?? whole,
    )
  if (phases.includes('reset')) {
    out = out.replace(SHADOW_PATTERN, (_, size) => SHADOWS[size])
    out = out.replace(/(^|:)shadow$/, (_, variants) => variants + SHADOWS[''])
  }
  return out
}

/** A file's text rewritten, with what changed and what was refused. */
export function rewrite(text, phase) {
  const counts = {}
  const refused = []
  const count = (from, to) => {
    const key = `${from} -> ${to}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  let out = text
  if (phase === 'names') {
    out = out.replace(NAME_PATTERN, (whole, utility, name, alpha, offset) => {
      const mapped = mapLegacy(utility, name, alpha)
      if (mapped === null) {
        refused.push({ token: whole, line: lineAt(text, offset) })
        return whole
      }
      count(whole, mapped)
      return mapped
    })
    out = out.replace(VARIABLE_PATTERN, (whole, name) => {
      const mapped = `var(--${VARIABLES[name]}`
      count(`${whole})`, `${mapped})`)
      return mapped
    })
  } else if (phase === 'reset') {
    out = out.replace(SHADOW_PATTERN, (whole, size) => {
      count(whole, SHADOWS[size])
      return SHADOWS[size]
    })
    out = out.replace(QUOTED, (whole, quote, body) => {
      if (!LOOKS_LIKE_CLASSES.test(body) || !BARE_SHADOW.test(body))
        return whole
      BARE_SHADOW.lastIndex = 0
      const next = body.replace(BARE_SHADOW, () => {
        count('shadow', SHADOWS[''])
        return SHADOWS['']
      })
      return quote + next + quote
    })
  } else {
    throw new Error(`unknown phase "${phase}": names or reset`)
  }
  return { text: out, counts, refused }
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length
}

/** Every source file the codemod reads. */
export function filesUnder(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) filesUnder(path, out)
    else if (/\.(tsx?|css|mdx)$/.test(entry)) out.push(path)
  }
  return out
}

/**
 * The token files keep their history, the bridge's test pins the old names
 * until it goes with the bridge, and tailwind-merge's tests name Tailwind's
 * scale on purpose.
 */
const SKIP = {
  names: [
    'packages/ui/src/styles/tokens.css',
    'packages/ui/src/styles/theme.css',
    'packages/ui/src/styles/legacy-bridge.test.ts',
  ],
  reset: [
    'packages/ui/src/styles/tokens.css',
    'packages/ui/src/styles/theme.css',
    'packages/ui/src/lib/cn.pure.ts',
    'packages/ui/src/lib/cn.pure.test.ts',
  ],
}

function main() {
  const repo = process.cwd()
  const phaseFlag = process.argv.indexOf('--phase')
  const phase = phaseFlag === -1 ? null : process.argv[phaseFlag + 1]
  if (!phase) throw new Error('--phase names|reset')
  const write = process.argv.includes('--write')
  const totals = {}
  const refused = []
  const touched = []
  for (const root of ['apps/convergence/src', 'packages/ui/src']) {
    for (const path of filesUnder(join(repo, root))) {
      const rel = relative(repo, path)
      if (SKIP[phase].includes(rel)) continue
      const before = readFileSync(path, 'utf8')
      const result = rewrite(before, phase)
      for (const item of result.refused)
        refused.push(`${rel}:${item.line} ${item.token}`)
      if (result.text === before) continue
      touched.push(rel)
      for (const [key, n] of Object.entries(result.counts))
        totals[key] = (totals[key] ?? 0) + n
      if (write) writeFileSync(path, result.text)
    }
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0)
  console.log(
    `${phase}: ${sum} rewrites in ${touched.length} files${write ? '' : ' (dry run)'}`,
  )
  for (const [key, n] of Object.entries(totals).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${key}`)
  if (refused.length) {
    console.log(`refused (${refused.length}), left as they are:`)
    for (const line of refused) console.log(`  ${line}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
