#!/usr/bin/env node
// DS3b (MAR-3616): Radix's Dialog becomes Base UI's, the mechanical part of
// the plan's §2.4. Run from the repo root with the files to rewrite, then
// Prettier:
//
//   node packages/ui/tools/codemods/ds3b-dialogs.mjs <file>...
//
//   <DialogTrigger asChild>{el}</…> / <DialogClose asChild>{el}</…>
//                                       render={el}
//   DialogContent w-[min(420|560|960|1280px,calc(100vw-2rem))], sm:max-w-[560px]
//                                       size="sm" | "md" | "xl" | "2xl"
//   DialogContent w-[min(720px,…)]      (gone: 720 is the default, lg)
//   DialogContent p-0                   (gone: the parts pad themselves)
//   hideClose                           showClose={false}
//   aria-describedby={undefined}        (gone: Base UI wires the description)
//   DialogHeader className "border-b border-border/70 px-6 py-5", with or
//     without pr-14, or "… border-white/10 …"   (gone: now the default)
//   DialogFooter className "border-t border-border/70 px-6 py-4", or
//     "… border-white/10 …"                      (gone: now the default)
//   a DialogHeader or DialogFooter className with no border of its own
//                                       gains border-b-0 / border-t-0, so it
//                                       keeps drawing none
//
// Left for a person: onOpenAutoFocus and onCloseAutoFocus (initialFocus and
// finalFocus), overlayClassName, a DialogContent restyled into a drawer
// (a Sheet), and confirmations (ConfirmDialog).
import { readFileSync, writeFileSync } from 'node:fs'

const SIZES = [
  ['w-[min(420px,calc(100vw-2rem))]', 'sm'],
  ['w-[min(560px,calc(100vw-2rem))]', 'md'],
  ['sm:max-w-[560px]', 'md'],
  ['w-[min(960px,calc(100vw-2rem))]', 'xl'],
  ['w-[min(1280px,calc(100vw-2rem))]', '2xl'],
]
const DEFAULT_HEADERS = [
  'border-b border-border/70 px-6 py-5',
  'border-b border-border/70 px-6 py-5 pr-14',
  'border-b border-white/10 px-6 py-5',
]
const DEFAULT_FOOTERS = [
  'border-t border-border/70 px-6 py-4',
  'border-t border-white/10 px-6 py-4',
]

/** `<Name asChild>{element}</Name>` becomes `<Name render={element} />`. */
const toRender = (source, name) =>
  source.replace(
    new RegExp(`<${name} asChild>\\s*([\\s\\S]*?)\\s*</${name}>`, 'g'),
    (_, inner) => {
      let element = inner.trim()
      if (element.startsWith('{') && element.endsWith('}'))
        element = element.slice(1, -1).trim()
      return `<${name} render={${element}} />`
    },
  )

/** Each `<Name …>` opening tag, read past braces and strings, given to `edit`. */
function eachOpeningTag(source, name, edit) {
  const pattern = new RegExp(`<${name}\\b`, 'g')
  let out = ''
  let index = 0
  for (let match; (match = pattern.exec(source)); ) {
    out += source.slice(index, match.index)
    let depth = 0
    let quote = null
    let end = match.index + match[0].length
    for (; end < source.length; end += 1) {
      const char = source[end]
      if (quote) {
        if (char === quote) quote = null
      } else if (`"'\``.includes(char)) quote = char
      else if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      else if (char === '>' && depth === 0) break
    }
    out += edit(source.slice(match.index, end + 1))
    index = end + 1
    pattern.lastIndex = index
  }
  return out + source.slice(index)
}

/** A tag's literal className, edited as a list of classes; empty drops it. */
const editClasses = (tag, edit) =>
  tag.replace(/\s+className="([^"]*)"/, (_, classes) => {
    const next = edit(classes.split(/\s+/).filter(Boolean))
    return next.length ? ` className="${next.join(' ')}"` : ''
  })

const content = (tag) => {
  let size = null
  let next = editClasses(tag, (classes) => {
    const kept = []
    for (const name of classes) {
      const sized = SIZES.find(([width]) => width === name)
      if (sized) size = sized[1]
      else if (name === 'w-[min(720px,calc(100vw-2rem))]' || name === 'p-0')
        continue
      else kept.push(name)
    }
    return kept
  })
  if (size)
    next = next.replace('<DialogContent', `<DialogContent size="${size}"`)
  return next
    .replace(/\s+hideClose\b(?!=)/, ' showClose={false}')
    .replace(/\s+aria-describedby=\{undefined\}/, '')
}

const part = (defaults, edge) => (tag) => {
  const literal = tag.match(/\s+className="([^"]*)"/)
  if (!literal) return tag
  if (defaults.includes(literal[1].trim())) return tag.replace(literal[0], '')
  const classes = literal[1].split(/\s+/)
  const drawsEdge = classes.some(
    (name) => name === edge || name.startsWith(`${edge}-`),
  )
  return drawsEdge ? tag : editClasses(tag, (names) => [`${edge}-0`, ...names])
}

const rewrite = (source) => {
  let next = toRender(source, 'DialogTrigger')
  next = toRender(next, 'DialogClose')
  next = eachOpeningTag(next, 'DialogContent', content)
  next = eachOpeningTag(next, 'DialogHeader', part(DEFAULT_HEADERS, 'border-b'))
  next = eachOpeningTag(next, 'DialogFooter', part(DEFAULT_FOOTERS, 'border-t'))
  return next
}

for (const file of process.argv.slice(2)) {
  const before = readFileSync(file, 'utf8')
  const after = rewrite(before)
  if (after !== before) {
    writeFileSync(file, after)
    console.log('rewrote', file)
  }
}
