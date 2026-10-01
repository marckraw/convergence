// Shared plumbing for the DS3 codemods (MAR-3616): find the app's .tsx files,
// parse them with the TypeScript compiler, collect text edits against the
// original source and apply them back to front, then prune the named imports
// from @convergence/ui that the edits left unused. Prettier runs after a
// codemod; the edits only need to be correct, not pretty.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

export { ts }

export const UI_MODULE = '@convergence/ui'

/** Every .tsx file under `root`, tests included, stories excluded. */
export function tsxFilesUnder(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.tsx') && !entry.name.includes('.stories.'))
        files.push(path)
    }
  }
  walk(root)
  return files.sort()
}

export function parse(path, source = readFileSync(path, 'utf8')) {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
}

export const isJsx = (node) =>
  ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)

export const openingOf = (node) =>
  ts.isJsxElement(node) ? node.openingElement : node

export const tagOf = (node, sf) => openingOf(node).tagName.getText(sf)

/** A JSX element's children that are not whitespace-only text. */
export const childrenOf = (node) =>
  ts.isJsxElement(node)
    ? node.children.filter(
        (child) =>
          !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces),
      )
    : []

/** The attributes of a JSX element, by name, plus whether it spreads props. */
export function attributesOf(node, sf) {
  const attrs = new Map()
  let spread = false
  for (const property of openingOf(node).attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      spread = true
      continue
    }
    const name = property.name.getText(sf)
    const init = property.initializer
    attrs.set(name, {
      node: property,
      text: property.getText(sf),
      // A string literal's value, or null for an expression or a bare flag.
      literal: init && ts.isStringLiteral(init) ? init.text : null,
      // The expression inside {…}, or null.
      expression:
        init && ts.isJsxExpression(init) && init.expression
          ? init.expression
          : null,
      bare: !init,
    })
  }
  return { attrs, spread }
}

export const lineOf = (node, sf) =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

/** Visits every node, depth first. */
export function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

/**
 * Applies edits ({ start, end, text }) to a source. Edits must not overlap;
 * an edit inside another is dropped (the outer one rewrote its text already).
 */
export function applyEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  let out = source
  let floor = Number.POSITIVE_INFINITY
  for (const edit of sorted) {
    if (edit.end > floor) continue
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
    floor = edit.start
  }
  return out
}

/**
 * Rewrites the named import from @convergence/ui: adds `add`, and drops any
 * name the rest of the file no longer mentions. Returns the new source.
 */
export function fixUiImports(path, source, add = []) {
  const sf = parse(path, source)
  const declaration = sf.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === UI_MODULE &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      !statement.importClause.isTypeOnly,
  )
  if (!declaration) {
    if (add.length === 0) return source
    const text = `import { ${[...new Set(add)].sort().join(', ')} } from '${UI_MODULE}'\n`
    const firstImport = sf.statements.find(ts.isImportDeclaration)
    const at = firstImport ? firstImport.getStart(sf) : 0
    return source.slice(0, at) + text + source.slice(at)
  }
  const rest =
    source.slice(0, declaration.getStart(sf)) +
    source.slice(declaration.getEnd())
  const mentioned = (name) => new RegExp(`\\b${name}\\b`).test(rest)
  const specifiers = declaration.importClause.namedBindings.elements.map(
    (element) => ({
      name: element.name.text,
      text: element.getText(sf),
    }),
  )
  const kept = specifiers.filter((specifier) => mentioned(specifier.name))
  for (const name of add) {
    if (!kept.some((specifier) => specifier.name === name))
      kept.push({ name, text: name })
  }
  kept.sort((a, b) => a.name.localeCompare(b.name))
  const text =
    kept.length === 0
      ? ''
      : `import { ${kept.map((specifier) => specifier.text).join(', ')} } from '${UI_MODULE}'`
  return (
    source.slice(0, declaration.getStart(sf)) +
    text +
    source.slice(declaration.getEnd())
  )
}

export const relativeTo = (root, path) => relative(root, path)
