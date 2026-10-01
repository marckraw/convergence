#!/usr/bin/env node
// DS3a, step 1 of 2 (MAR-3616): Radix's per-instance tooltip becomes the one
// tooltip host. Run from the repo root:
//
//   node packages/ui/tools/codemods/ds3a-tooltips.mjs          (dry run: report)
//   node packages/ui/tools/codemods/ds3a-tooltips.mjs --write  (rewrite files)
//
// then Prettier. The mapping (the plan's §2.2):
//
//   <Tooltip><TooltipTrigger asChild>{el}</TooltipTrigger>
//     <TooltipContent side=S …>{text or one expression}</TooltipContent>
//   </Tooltip>                      ->  <Tooltip label={…} side=S>{el}</Tooltip>
//
//   TooltipContent's style={NO_DRAG_STYLE}  dropped: the host is app-no-drag
//   Tooltip's delayDuration                 dropped: one delay, in UiProvider
//   a nested <TooltipProvider …>            unwrapped (app code, not tests)
//   App.container's <TooltipProvider>       <UiProvider>
//
// A body that is JSX (a list, two lines) is refused and listed: those become
// TooltipCard or label + detail by hand. A dropped className or align is
// listed too, to check by hand (R8: one surface). Tooltip-wrapped icon
// Buttons become IconButtons in step 2 (ds3a-buttons.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyEdits,
  attributesOf,
  childrenOf,
  fixUiImports,
  isJsx,
  lineOf,
  parse,
  relativeTo,
  tagOf,
  ts,
  tsxFilesUnder,
  walk,
} from './jsx-edit.mjs'

const repo = process.cwd()
// --root <dir>: run on another copy of the app's source (to replay it on the
// tree before the migration).
const rootFlag = process.argv.indexOf('--root')
const appSource =
  rootFlag === -1
    ? join(repo, 'apps/convergence/src')
    : process.argv[rootFlag + 1]
const write = process.argv.includes('--write')

const report = { mapped: [], refused: [], checkByHand: [], providers: [] }

/** A plain-text body as one line, or null when it has markup in it. */
const textLabel = (body, sf) => {
  const text = body
    .map((child) => child.getText(sf))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

const attributeFor = (text) =>
  /["{}<>]/.test(text) ? `label={${JSON.stringify(text)}}` : `label="${text}"`

function migrateFile(path) {
  const source = readFileSync(path, 'utf8')
  if (!source.includes('Tooltip')) return null
  const sf = parse(path, source)
  const where = (node) => `${relativeTo(appSource, path)}:${lineOf(node, sf)}`
  // Tests and their fixtures keep a provider: it stands in for the app's root.
  const isTest = /\.(test|fixture)\./.test(path)
  const edits = []
  const add = []

  walk(sf, (node) => {
    if (!isJsx(node)) return
    const tag = tagOf(node, sf)

    if (tag === 'TooltipProvider' && !isTest && ts.isJsxElement(node)) {
      // Boundary edits only (the opening and the closing tag), so an edit
      // inside the provider still applies.
      const opening = node.openingElement
      const closing = node.closingElement
      const kids = childrenOf(node)
      let wrapper
      if (path.endsWith('app/App.container.tsx')) {
        wrapper = 'UiProvider'
        add.push('UiProvider')
        report.providers.push(`${where(node)} -> UiProvider`)
      } else {
        // One element child stands alone; anything else keeps a fragment.
        wrapper = kids.length === 1 && isJsx(kids[0]) ? null : ''
        report.providers.push(`${where(node)} unwrapped`)
      }
      edits.push({
        start: opening.getStart(sf),
        end: opening.getEnd(),
        text: wrapper === null ? '' : `<${wrapper}>`,
      })
      edits.push({
        start: closing.getStart(sf),
        end: closing.getEnd(),
        text: wrapper === null ? '' : `</${wrapper}>`,
      })
      return
    }

    if (tag !== 'Tooltip' || !ts.isJsxElement(node)) return
    // Already the new Tooltip: a label, and the element as its child.
    if (attributesOf(node, sf).attrs.has('label')) return
    const parts = childrenOf(node)
    const trigger = parts.find(
      (part) => isJsx(part) && tagOf(part, sf) === 'TooltipTrigger',
    )
    const content = parts.find(
      (part) => isJsx(part) && tagOf(part, sf) === 'TooltipContent',
    )
    if (parts.length !== 2 || !trigger || !content) {
      report.refused.push(`${where(node)}: not a trigger and a content`)
      return
    }
    const triggerAttrs = attributesOf(trigger, sf).attrs
    const triggerChildren = childrenOf(trigger)
    if (!triggerAttrs.has('asChild') || triggerChildren.length !== 1) {
      report.refused.push(`${where(node)}: trigger is not asChild of one child`)
      return
    }
    const body = childrenOf(content)
    const markup = body.some((child) => isJsx(child) || ts.isJsxFragment(child))
    let label
    if (
      body.length === 1 &&
      ts.isJsxExpression(body[0]) &&
      body[0].expression
    ) {
      label = `label={${body[0].expression.getText(sf)}}`
    } else if (!markup && body.every((child) => ts.isJsxText(child))) {
      label = attributeFor(textLabel(body, sf))
    } else {
      report.refused.push(
        `${where(node)}: the body is markup (TooltipCard or detail)`,
      )
      return
    }

    const contentAttrs = attributesOf(content, sf).attrs
    const rootAttrs = attributesOf(node, sf).attrs
    const kept = []
    if (rootAttrs.has('key')) kept.push(rootAttrs.get('key').text)
    kept.push(label)
    if (contentAttrs.has('side')) kept.push(contentAttrs.get('side').text)
    for (const name of contentAttrs.keys()) {
      if (['side', 'style'].includes(name)) continue
      report.checkByHand.push(
        `${where(node)}: dropped ${contentAttrs.get(name).text}`,
      )
    }
    for (const name of rootAttrs.keys()) {
      if (['key', 'delayDuration'].includes(name)) continue
      report.refused.push(`${where(node)}: Tooltip has ${name}`)
      return
    }
    // Boundary edits only: from <Tooltip> to the trigger's child, and from
    // its end to </Tooltip>; the child itself is left for other edits.
    const element = triggerChildren[0]
    edits.push({
      start: node.getStart(sf),
      end: element.getStart(sf),
      text: `<Tooltip ${kept.join(' ')}>`,
    })
    edits.push({
      start: element.getEnd(),
      end: node.getEnd(),
      text: '</Tooltip>',
    })
    report.mapped.push(where(node))
  })

  if (edits.length === 0) return null
  return fixUiImports(path, applyEdits(source, edits), add)
}

for (const path of tsxFilesUnder(appSource)) {
  const next = migrateFile(path)
  if (next !== null && write) writeFileSync(path, next)
}

console.log(`Tooltips mapped: ${report.mapped.length}`)
console.log(`Providers: ${report.providers.length}`)
for (const line of report.providers) console.log(`  ${line}`)
console.log(`Refused, to migrate by hand: ${report.refused.length}`)
for (const line of report.refused) console.log(`  ${line}`)
console.log(`Check by hand: ${report.checkByHand.length}`)
for (const line of report.checkByHand) console.log(`  ${line}`)
if (!write) console.log('\nDry run: nothing written. Pass --write to rewrite.')
