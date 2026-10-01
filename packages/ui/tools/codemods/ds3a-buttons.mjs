#!/usr/bin/env node
// DS3a, step 2 of 2 (MAR-3616): every <Button> moves to the new variants and
// the one size scale, and icon-only Buttons become IconButtons. Run from the
// repo root after ds3a-tooltips.mjs:
//
//   node packages/ui/tools/codemods/ds3a-buttons.mjs          (dry run: report)
//   node packages/ui/tools/codemods/ds3a-buttons.mjs --write  (rewrite files)
//   node packages/ui/tools/codemods/ds3a-buttons.mjs --root <dir>  (another copy)
//
// then Prettier. The mapping is the plan's §2.1:
//
//   variant default/destructive/outline/secondary  primary/danger/secondary/tonal
//   ghost + text-muted-foreground hover:text-foreground   quiet (classes go)
//   ghost or outline + text-destructive                   danger-quiet (classes go)
//   the height a Button is drawn at, 24/28/32/36 px       size xs/sm/md/lg
//     (today's default 36 is lg; today's sm 32 is md, the new default)
//   40 px                                                  lg (R3, a visible change)
//   size="icon", or children that are only icons          <IconButton label=…>
//     label from aria-label, else title, else the Tooltip around it, which goes
//   16 or 20 px icon buttons                               IconButton xs (R3)
//   title on a text Button                                 <Tooltip label=…>
//
// No visible change otherwise: the codemod works out the box a Button was
// drawn with (height, width, padding, gap, text size: the kit's recipe, then
// the className, as twMerge resolves them) and the box the new recipe draws.
// A class the new recipe already draws is stripped; one the old box had and
// the new does not is kept, or added back. A height off the scale (auto,
// 14 or 30 px) keeps its class: those rows and tiles move to ListRow, Card or
// SegmentedControl in DS4.
//
// Refused, and listed, for a hand: a spread of props, asChild, a size from an
// expression, a className whose box classes the codemod cannot read, an
// icon-only Button with no name, and a Tooltip whose words differ from the
// button's name.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { twMerge } from 'tailwind-merge'
import {
  applyEdits,
  attributesOf,
  childrenOf,
  fixUiImports,
  isJsx,
  lineOf,
  openingOf,
  parse,
  relativeTo,
  tagOf,
  ts,
  tsxFilesUnder,
  walk,
} from './jsx-edit.mjs'

const repo = process.cwd()
const rootFlag = process.argv.indexOf('--root')
const appSource =
  rootFlag === -1
    ? join(repo, 'apps/convergence/src')
    : process.argv[rootFlag + 1]
const write = process.argv.includes('--write')

/** Today's kit, the box half of it (packages/ui before MAR-3616). */
const OLD_BASE = 'gap-2 text-sm'
const OLD_SIZES = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-10 px-8',
  icon: 'h-9 w-9',
}
/** The new recipes' box half (button.tsx). A link has no box. */
const TEXT_SIZES = {
  xs: 'h-6 gap-1 px-2 text-[11px]',
  sm: 'h-7 gap-1.5 px-2 text-xs',
  md: 'h-8 gap-2 px-3 text-xs',
  lg: 'h-9 gap-2 px-4 py-2 text-sm',
}
const ICON_SIZES = { xs: 'size-6', sm: 'size-7', md: 'size-8', lg: 'size-9' }
const SIZE_BY_PX = { 24: 'xs', 28: 'sm', 32: 'md', 36: 'lg' }
/** When the height is off the scale, the size whose recipe was today's. */
const SIZE_BY_OLD = { default: 'lg', sm: 'md', lg: 'lg', icon: 'lg' }
const VARIANT_NAMES = {
  default: 'primary',
  destructive: 'danger',
  outline: 'secondary',
  secondary: 'tonal',
  ghost: 'ghost',
  link: 'link',
}

const report = {
  buttons: 0,
  iconButtons: 0,
  tooltipsFolded: 0,
  titlesWrapped: [],
  refused: [],
  visible: [],
  offScale: [],
  check: [],
}

// --- classes --------------------------------------------------------------

/** Splits a class string into tokens. */
const tokensOf = (value) => value.split(/\s+/).filter(Boolean)

/** Whether a token carries a variant (`hover:`, `md:`), outside brackets. */
const isPrefixed = (token) => {
  let depth = 0
  for (const char of token) {
    if (char === '[') depth += 1
    else if (char === ']') depth -= 1
    else if (char === ':' && depth === 0) return true
  }
  return token.startsWith('!')
}

const FONT_SIZE =
  /^text-(xs|sm|base|lg|xl|[2-9]xl|\[\d[^\]]*(px|rem|em)\]|\[length:[^\]]+\])(\/\S+)?$/

/** The box properties one unprefixed token sets. */
const propertiesOf = (token) => {
  if (isPrefixed(token)) return []
  if (/^size-/.test(token)) return ['h', 'w']
  if (/^h-/.test(token)) return ['h']
  if (/^w-/.test(token)) return ['w']
  if (/^p-/.test(token)) return ['pt', 'pr', 'pb', 'pl']
  if (/^px-/.test(token)) return ['pl', 'pr']
  if (/^py-/.test(token)) return ['pt', 'pb']
  if (/^pt-/.test(token)) return ['pt']
  if (/^pb-/.test(token)) return ['pb']
  if (/^(pl|ps)-/.test(token)) return ['pl']
  if (/^(pr|pe)-/.test(token)) return ['pr']
  if (/^gap-x-/.test(token)) return ['gx']
  if (/^gap-y-/.test(token)) return ['gy']
  if (/^gap-/.test(token)) return ['gx', 'gy']
  if (FONT_SIZE.test(token)) return ['font']
  return []
}

const BOX = ['h', 'w', 'pt', 'pr', 'pb', 'pl', 'gx', 'gy', 'font']

/** The class that takes a property back to nothing, where the old box had none. */
const ZERO = {
  h: 'h-auto',
  w: 'w-auto',
  pt: 'pt-0',
  pb: 'pb-0',
  pl: 'pl-0',
  pr: 'pr-0',
  gx: 'gap-x-0',
  gy: 'gap-y-0',
}

/**
 * The value a property ends with, as the token that set it, normalised so
 * that "nothing" and its explicit spellings compare equal (p-0, gap-0,
 * h-auto, w-auto).
 */
const valueOf = (property, token) => {
  if (!token) return null
  if (['pt', 'pr', 'pb', 'pl', 'gx', 'gy'].includes(property)) {
    if (/-0$/.test(token)) return null
    const m = token.match(
      /^(?:p|px|py|pt|pb|pl|pr|ps|pe|gap|gap-x|gap-y)-(.+)$/,
    )
    return m ? m[1] : token
  }
  if (property === 'h' || property === 'w') {
    const m = token.match(/^(?:h|w|size)-(.+)$/)
    const v = m ? m[1] : token
    return v === 'auto' ? null : v
  }
  return token
}

/** Each box property's winning token, from classes as twMerge leaves them. */
const boxOf = (classes) => {
  const box = Object.fromEntries(BOX.map((p) => [p, null]))
  for (const token of tokensOf(twMerge(classes))) {
    for (const property of propertiesOf(token)) box[property] = token
  }
  return box
}

const sameBox = (a, b, properties) =>
  properties.every((p) => valueOf(p, a[p]) === valueOf(p, b[p]))

/** A height token as px, or null when it isn't on Tailwind's 4 px scale. */
const pxOf = (token) => {
  if (!token) return null
  const m = token.match(/^(?:h|size)-(\d+(?:\.\d+)?)$/)
  if (m) return Number(m[1]) * 4
  const arbitrary = token.match(/^(?:h|size)-\[(\d+)px\]$/)
  return arbitrary ? Number(arbitrary[1]) : null
}

// --- the className a Button has ---------------------------------------------

/** The string a constant is, when it is plainly one; null otherwise. */
function stringOf(expression, sf, resolve) {
  if (!expression) return null
  let e = expression
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e))
    e = e.expression
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
    return e.text
  if (
    ts.isCallExpression(e) &&
    ts.isPropertyAccessExpression(e.expression) &&
    e.expression.name.text === 'join' &&
    ts.isArrayLiteralExpression(e.expression.expression)
  ) {
    const parts = e.expression.expression.elements.map((el) =>
      stringOf(el, sf, resolve),
    )
    return parts.every((p) => p !== null) ? parts.join(' ') : null
  }
  if (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === 'cn'
  ) {
    const parts = e.arguments.map((arg) => stringOf(arg, sf, resolve))
    return parts.every((p) => p !== null) ? parts.join(' ') : null
  }
  if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) return resolve(e)
  return null
}

/** Finds `const NAME = …` (or `NAME: …` in an object) in a file. */
function constantIn(sf, path, resolve) {
  const value = (node) => {
    if (path.length === 1) return stringOf(node, sf, resolve)
    let e = node
    while (
      ts.isAsExpression(e) ||
      ts.isParenthesizedExpression(e) ||
      ts.isSatisfiesExpression?.(e)
    )
      e = e.expression
    if (!ts.isObjectLiteralExpression(e)) return null
    for (const property of e.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText(sf).replace(/['"]/g, '') === path[1]
      )
        return stringOf(property.initializer, sf, resolve)
    }
    return null
  }
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === path[0] &&
        declaration.initializer
      )
        return value(declaration.initializer)
    }
  }
  return undefined
}

/** Resolves a constant used as a className, here or in a relative import. */
function resolverFor(sf, filePath) {
  const resolve = (expression) => {
    const path = ts.isIdentifier(expression)
      ? [expression.text]
      : ts.isIdentifier(expression.expression)
        ? [expression.expression.text, expression.name.text]
        : null
    if (!path) return null
    const local = constantIn(sf, path, resolve)
    if (local !== undefined) return local
    for (const statement of sf.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !statement.moduleSpecifier.text.startsWith('.') ||
        !statement.importClause?.namedBindings ||
        !ts.isNamedImports(statement.importClause.namedBindings)
      )
        continue
      const imported = statement.importClause.namedBindings.elements.find(
        (element) => element.name.text === path[0],
      )
      if (!imported) continue
      const base = join(filePath, '..', statement.moduleSpecifier.text)
      for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
        try {
          const other = parse(candidate)
          const found = constantIn(
            other,
            [imported.propertyName?.text ?? path[0], ...path.slice(1)],
            resolverFor(other, candidate),
          )
          if (found !== undefined) return found
        } catch {
          // not this extension
        }
      }
    }
    return null
  }
  return resolve
}

/**
 * The className as the codemod can work with it:
 * - `literal`: a string it may rewrite (a plain string, or cn's first string);
 * - `fixed`: the classes of a constant it must not edit (it can only add);
 * - `dynamic`: the classes a condition may add; refused if any is a box class.
 */
function classNameOf(attribute, sf, resolve) {
  if (!attribute) return { kind: 'none', classes: '' }
  if (attribute.literal !== null)
    return {
      kind: 'literal',
      classes: attribute.literal,
      node: attribute.node.initializer,
    }
  const e = attribute.expression
  if (!e) return { kind: 'unknown' }
  if (ts.isNoSubstitutionTemplateLiteral(e))
    return { kind: 'literal', classes: e.text, node: e }
  if (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === 'cn'
  ) {
    const [first, ...rest] = e.arguments
    const dynamic = []
    const collect = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        dynamic.push(node.text)
      ts.forEachChild(node, collect)
    }
    rest.forEach(collect)
    const dynamicBox = dynamic
      .flatMap(tokensOf)
      .filter((t) => propertiesOf(t).length > 0)
    if (dynamicBox.length > 0)
      return {
        kind: 'unknown',
        why: `box classes under a condition: ${dynamicBox.join(' ')}`,
      }
    if (first && ts.isStringLiteral(first))
      return { kind: 'literal', classes: first.text, node: first }
    const fixed = first ? stringOf(first, sf, resolve) : ''
    if (fixed === null)
      return { kind: 'unknown', why: 'cn() of something unreadable' }
    return { kind: 'fixed', classes: fixed, callFirst: first }
  }
  const fixed = stringOf(e, sf, resolve)
  if (fixed !== null) return { kind: 'fixed', classes: fixed, whole: e }
  return { kind: 'unknown', why: `className={${e.getText(sf).slice(0, 60)}}` }
}

// --- children -------------------------------------------------------------

function lucideNamesOf(sf) {
  const names = new Set()
  for (const statement of sf.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === 'lucide-react' &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    )
      for (const element of statement.importClause.namedBindings.elements)
        names.add(element.name.text)
  }
  return names
}

/** Whether a child is an icon, or a condition between icons. */
function isGlyph(node, sf, lucide) {
  let e = node
  if (ts.isJsxExpression(e)) e = e.expression
  while (e && ts.isParenthesizedExpression(e)) e = e.expression
  if (!e) return false
  if (ts.isJsxSelfClosingElement(e)) {
    const tag = e.tagName.getText(sf)
    return lucide.has(tag) || /^[A-Z]\w*Icon$/.test(tag)
  }
  if (ts.isConditionalExpression(e))
    return isGlyph(e.whenTrue, sf, lucide) && isGlyph(e.whenFalse, sf, lucide)
  if (
    ts.isBinaryExpression(e) &&
    e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  )
    return isGlyph(e.right, sf, lucide)
  return false
}

// --- one Button -----------------------------------------------------------

const textOfAttribute = (attribute) =>
  attribute.literal !== null
    ? JSON.stringify(attribute.literal)
    : attribute.expression
      ? attribute.expression
          .getText()
          .replace(/\s+/g, ' ')
          .replace(/\(\s*/g, '(')
          .replace(/\s*\)/g, ')')
      : null

const labelAttribute = (attribute, name = 'label') =>
  attribute.literal !== null
    ? /["{}]/.test(attribute.literal)
      ? `${name}={${JSON.stringify(attribute.literal)}}`
      : `${name}="${attribute.literal}"`
    : `${name}={${attribute.expression.getText()}}`

/**
 * The Tooltip a Button sits in, directly or through `*Trigger asChild`
 * wrappers (a menu's or a popover's trigger), when it holds nothing else.
 */
function tooltipAround(node, sf) {
  let child = node
  let parent = node.parent
  while (parent && ts.isJsxElement(parent)) {
    const kids = childrenOf(parent)
    if (kids.length !== 1 || kids[0] !== child) return null
    const tag = tagOf(parent, sf)
    if (tag === 'Tooltip') return parent
    if (!/Trigger$/.test(tag) || !attributesOf(parent, sf).attrs.has('asChild'))
      return null
    child = parent
    parent = parent.parent
  }
  return null
}

function migrateButton(node, sf, where, lucide, resolve, edits, add) {
  const { attrs, spread } = attributesOf(node, sf)
  if (spread) return report.refused.push(`${where}: spreads props`)
  if (attrs.has('asChild')) return report.refused.push(`${where}: asChild`)
  const sizeAttr = attrs.get('size')
  if (sizeAttr && sizeAttr.literal === null)
    return report.refused.push(`${where}: size from an expression`)
  const oldSize = sizeAttr?.literal ?? 'default'
  const className = classNameOf(attrs.get('className'), sf, resolve)
  if (className.kind === 'unknown')
    return report.refused.push(`${where}: ${className.why}`)

  const kids = childrenOf(node)
  // Icon-only: today's square size with no words in it, or nothing but icons.
  const words = kids.some((kid) => ts.isJsxText(kid))
  const iconOnly =
    (oldSize === 'icon' && !words) ||
    (kids.length > 0 && kids.every((kid) => isGlyph(kid, sf, lucide)))
  const variantAttr = attrs.get('variant')
  const oldVariant = variantAttr ? (variantAttr.literal ?? 'expr') : 'default'

  // Variant, and the classes a variant now carries.
  let variantText = null
  let strip = []
  const staticTokens = tokensOf(className.classes ?? '')
  if (oldVariant === 'expr') {
    variantText = `variant={${variantAttr.expression
      .getText(sf)
      .replace(
        /(['"])(default|destructive|outline|secondary)\1/g,
        (_, q, name) => `${q}${VARIANT_NAMES[name]}${q}`,
      )}}`
  } else {
    let variant = VARIANT_NAMES[oldVariant] ?? oldVariant
    if (
      oldVariant === 'ghost' &&
      staticTokens.includes('text-muted-foreground') &&
      staticTokens.includes('hover:text-foreground')
    ) {
      variant = 'quiet'
      strip = ['text-muted-foreground', 'hover:text-foreground']
    } else if (
      ['ghost', 'outline'].includes(oldVariant) &&
      staticTokens.includes('text-destructive')
    ) {
      variant = 'danger-quiet'
      strip = [
        'text-destructive',
        'hover:text-destructive',
        'hover:bg-destructive/10',
      ]
      if (oldVariant === 'outline')
        report.check.push(
          `${where}: outline + text-destructive -> danger-quiet loses the border`,
        )
    }
    if (className.kind === 'fixed' && strip.length) {
      // A constant's classes are not ours to strip; keep the variant plain.
      variant = VARIANT_NAMES[oldVariant] ?? oldVariant
      strip = []
    }
    variantText = variant === 'primary' ? null : `variant="${variant}"`
  }
  const isLink = oldVariant === 'link'

  // The box it was drawn with.
  const oldBox = boxOf(
    `${OLD_BASE} ${OLD_SIZES[oldSize]} ${className.classes ?? ''}`,
  )
  const height = pxOf(oldBox.h)
  let newSize
  let accepted = []
  if (iconOnly && (height === 16 || height === 20)) {
    newSize = 'xs'
    accepted = ['h', 'w']
    report.visible.push(`${where}: ${height} px icon button -> 24 px (R3)`)
  } else if (height === 40) {
    newSize = 'lg'
    accepted = ['h']
    report.visible.push(`${where}: 40 px -> 36 px (R3)`)
  } else if (SIZE_BY_PX[height]) {
    newSize = SIZE_BY_PX[height]
  } else {
    newSize = SIZE_BY_OLD[oldSize]
    if (!isLink)
      report.offScale.push(
        `${where}: height ${oldBox.h ?? 'auto'} kept as a class`,
      )
  }
  const shape = iconOnly ? 'icon' : 'text'
  const recipe = isLink
    ? ''
    : (shape === 'icon' ? ICON_SIZES : TEXT_SIZES)[newSize]

  // What to compare: an icon button's square makes its padding, gap and text
  // size moot; one child makes the gap moot.
  let compare = BOX.filter((p) => !accepted.includes(p))
  const square = shape === 'icon'
  if (square) compare = compare.filter((p) => ['h', 'w'].includes(p))
  else if (kids.length < 2)
    compare = compare.filter((p) => !['gx', 'gy'].includes(p))
  if (square) compare = compare.filter((p) => p !== 'w')

  // An accepted change (R3) drops the old height, so the size draws it.
  let tokens =
    className.kind === 'literal'
      ? staticTokens.filter(
          (t) =>
            !strip.includes(t) &&
            !propertiesOf(t).some((p) => accepted.includes(p)),
        )
      : []
  if (className.kind === 'fixed' && accepted.length)
    report.check.push(
      `${where}: its height lives in a shared constant; R3's size cannot win over it`,
    )
  const fixedClasses = className.kind === 'fixed' ? className.classes : ''
  const newBoxOf = (list) =>
    boxOf(`${recipe} ${fixedClasses} ${list.join(' ')}`)
  // Add back what the old box had and the new one lacks.
  for (const property of compare) {
    const now = newBoxOf(tokens)
    if (
      valueOf(property, now[property]) === valueOf(property, oldBox[property])
    )
      continue
    if (oldBox[property]) tokens.push(oldBox[property])
    else if (ZERO[property]) tokens.push(ZERO[property])
    else
      report.check.push(`${where}: cannot unset ${property} (${now[property]})`)
  }
  // Two halves of a zero read as one class.
  for (const [a, b, both] of [
    ['pt-0', 'pb-0', 'py-0'],
    ['pl-0', 'pr-0', 'px-0'],
  ]) {
    if (tokens.includes(a) && tokens.includes(b))
      tokens = [...tokens.filter((t) => t !== a && t !== b), both]
  }
  // Strip what the new recipe draws already (only from a string we own).
  if (className.kind === 'literal') {
    for (const token of [...tokens]) {
      if (propertiesOf(token).length === 0) continue
      const without = tokens.filter((t) => t !== token)
      if (sameBox(newBoxOf(without), newBoxOf(tokens), BOX)) tokens = without
    }
  }
  const finalBox = newBoxOf(tokens)
  if (
    square &&
    !accepted.includes('w') &&
    valueOf('w', finalBox.w) !== valueOf('w', oldBox.w)
  )
    report.visible.push(
      `${where}: icon-only ${oldBox.w ?? 'auto'} wide -> ${finalBox.w} (square, R3)`,
    )

  // The new attributes, in place.
  const label =
    attrs.get('aria-label') ?? (iconOnly ? attrs.get('title') : null)
  const tooltip = iconOnly ? tooltipAround(node, sf) : null
  let tooltipLabel = null
  let tooltipSide = null
  if (tooltip) {
    const t = attributesOf(tooltip, sf).attrs
    tooltipLabel = t.get('label') ?? null
    tooltipSide = t.get('side') ?? null
    if ([...t.keys()].some((k) => !['label', 'side', 'key'].includes(k)))
      return report.refused.push(`${where}: its Tooltip has more than a label`)
  }
  let labelText = null
  if (iconOnly) {
    if (label) labelText = labelAttribute(label)
    else if (tooltipLabel) labelText = labelAttribute(tooltipLabel)
    else return report.refused.push(`${where}: icon-only with no name`)
    if (
      tooltipLabel &&
      label &&
      textOfAttribute(tooltipLabel) !== textOfAttribute(label)
    )
      return report.refused.push(
        `${where}: Tooltip says ${textOfAttribute(tooltipLabel)}, the name is ${textOfAttribute(label)}`,
      )
    const title = attrs.get('title')
    if (title && label && textOfAttribute(title) !== textOfAttribute(label))
      return report.refused.push(
        `${where}: title ${textOfAttribute(title)} differs from the name ${textOfAttribute(label)}`,
      )
  }

  const out = []
  for (const [name, attribute] of attrs) {
    if (name === 'variant') {
      if (variantText) out.push(variantText)
    } else if (name === 'size') {
      continue
    } else if (name === 'className') {
      continue
    } else if (iconOnly && (name === 'aria-label' || name === 'title')) {
      continue
    } else if (!iconOnly && name === 'title') {
      continue
    } else {
      out.push(attribute.text)
    }
  }
  if (!variantAttr && variantText) out.unshift(variantText)
  if (iconOnly) {
    out.unshift(labelText)
    if (tooltipSide) out.push(labelAttribute(tooltipSide, 'tooltipSide'))
  }
  if (newSize !== 'md') out.push(`size="${newSize}"`)
  // The className, rewritten where we own it, added to where we don't.
  const classText = tokens.join(' ')
  if (className.kind === 'literal') {
    const attribute = attrs.get('className')
    if (
      attribute.literal !== null ||
      ts.isNoSubstitutionTemplateLiteral(attribute.expression)
    ) {
      if (classText) out.push(`className="${classText}"`)
    } else {
      const call = attribute.expression
      const first = call.arguments[0]
      const rest = call.arguments.slice(1).map((a) => a.getText(sf))
      const args = [
        classText ? JSON.stringify(classText).replace(/^"|"$/g, "'") : null,
        ...rest,
      ].filter(Boolean)
      void first
      // cn() stays unless what is left is a plain string or a name: a
      // condition (`open && '…'`) can be false, which className refuses.
      const plain =
        rest.length === 1 &&
        (ts.isIdentifier(call.arguments[1]) ||
          ts.isPropertyAccessExpression(call.arguments[1]))
      if (args.length === 1 && classText) out.push(`className="${classText}"`)
      else if (args.length === 1 && plain) out.push(`className={${args[0]}}`)
      else if (args.length >= 1) out.push(`className={cn(${args.join(', ')})}`)
    }
  } else if (className.kind === 'fixed') {
    const original = attrs.get('className').expression.getText(sf)
    if (classText) {
      out.push(`className={cn(${original}, '${classText}')}`)
      add.push('cn')
    } else out.push(`className={${original}}`)
  } else if (classText) {
    out.push(`className="${classText}"`)
  }

  const tag = iconOnly ? 'IconButton' : 'Button'
  const opening = openingOf(node)
  const selfClosing = ts.isJsxSelfClosingElement(node)
  edits.push({
    start: opening.getStart(sf),
    end: opening.getEnd(),
    text: `<${tag} ${out.join(' ')}${selfClosing ? ' />' : '>'}`,
  })
  if (!selfClosing) {
    const closing = node.closingElement
    edits.push({
      start: closing.getStart(sf),
      end: closing.getEnd(),
      text: `</${tag}>`,
    })
  }
  if (iconOnly) {
    add.push('IconButton')
    report.iconButtons += 1
    if (tooltip) {
      // The Tooltip said the name again: IconButton says it once.
      const tOpen = tooltip.openingElement
      edits.push({ start: tOpen.getStart(sf), end: tOpen.getEnd(), text: '' })
      edits.push({
        start: tooltip.closingElement.getStart(sf),
        end: tooltip.closingElement.getEnd(),
        text: '',
      })
      report.tooltipsFolded += 1
    }
  } else {
    report.buttons += 1
    const title = attrs.get('title')
    if (title) {
      const parent = node.parent
      if (parent && ts.isJsxElement(parent) && tagOf(parent, sf) === 'Tooltip')
        return report.refused.push(`${where}: title inside a Tooltip`)
      edits.push({
        start: node.getStart(sf),
        end: node.getStart(sf),
        text: `<Tooltip ${labelAttribute(title)}>`,
      })
      edits.push({
        start: node.getEnd(),
        end: node.getEnd(),
        text: '</Tooltip>',
      })
      add.push('Tooltip')
      report.titlesWrapped.push(`${where}: ${textOfAttribute(title)}`)
    }
  }
}

function migrateFile(path) {
  const source = readFileSync(path, 'utf8')
  if (!source.includes('<Button')) return null
  const sf = parse(path, source)
  const lucide = lucideNamesOf(sf)
  const resolve = resolverFor(sf, path)
  const edits = []
  const add = []
  walk(sf, (node) => {
    if (!isJsx(node) || tagOf(node, sf) !== 'Button') return
    const where = `${relativeTo(appSource, path)}:${lineOf(node, sf)}`
    migrateButton(node, sf, where, lucide, resolve, edits, add)
  })
  if (edits.length === 0) return null
  return fixUiImports(path, applyEdits(source, edits), add)
}

// Run once, on the tree before DS3a: today's sm means 32 px there and 28 px
// after, so a second pass would shrink every button the first one moved. The
// old API's own words (size="icon", outline, destructive) are the sign that
// a tree has not been migrated yet.
const OLD_API = /size="icon"|variant="(?:outline|destructive|default)"/
if (
  !tsxFilesUnder(appSource).some((path) =>
    OLD_API.test(readFileSync(path, 'utf8')),
  )
) {
  console.log('This tree already speaks the new Button API: nothing to do.')
  process.exit(0)
}

for (const path of tsxFilesUnder(appSource)) {
  const next = migrateFile(path)
  if (next !== null && write) writeFileSync(path, next)
}

const list = (title, lines) => {
  console.log(`${title}: ${lines.length}`)
  for (const line of lines) console.log(`  ${line}`)
}
console.log(`Buttons mapped: ${report.buttons}`)
console.log(
  `IconButtons made: ${report.iconButtons} (${report.tooltipsFolded} Tooltips folded into their label)`,
)
list(
  'Titles moved into a Tooltip (check for disabled reasons)',
  report.titlesWrapped,
)
list('Refused, to migrate by hand', report.refused)
list('Visible changes (R3)', report.visible)
list('Heights off the scale, kept as a class until DS4', report.offScale)
list('Check by hand', report.check)
if (!write) console.log('\nDry run: nothing written. Pass --write to rewrite.')
