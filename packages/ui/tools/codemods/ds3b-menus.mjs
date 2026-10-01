#!/usr/bin/env node
// DS3b (MAR-3616): Radix's DropdownMenu becomes Base UI's Menu, and a
// PopoverTrigger asChild becomes a PopoverTrigger render: the mechanical part
// of the plan's §2.5 and §2.6. Run from the repo root with the files to
// rewrite, then Prettier:
//
//   node packages/ui/tools/codemods/ds3b-menus.mjs <file>...
//   node packages/ui/tools/codemods/ds3b-menus.mjs --popover <file>...
//
// Menus:
//
//   DropdownMenu / …Content / …Item / …Separator   Menu / MenuContent / MenuItem / MenuSeparator
//   <DropdownMenuTrigger asChild>{el}</…>          <MenuTrigger render={el} />
//     (Base UI clones the element; the element's own children win)
//   item onSelect=                                  onClick=
//   item className="gap-2"                          (gone: the gap is built in)
//   item className="gap-2 text-destructive focus:text-destructive"   variant="danger" (R5)
//
// Popovers (--popover):
//
//   <PopoverTrigger asChild>{el}</…>               <PopoverTrigger render={el} />
//
// Left for a person: focus handlers (onCloseAutoFocus, onInteractOutside,
// onOpenAutoFocus), an onSelect that calls preventDefault, hand-rolled
// role="menuitemcheckbox" items, a span trigger (nativeButton={false}), and
// menus that are really panels (they become Popovers).
import { readFileSync, writeFileSync } from 'node:fs'

const RENAMES = [
  ['DropdownMenuSeparator', 'MenuSeparator'],
  ['DropdownMenuContent', 'MenuContent'],
  ['DropdownMenuItem', 'MenuItem'],
  ['DropdownMenuTrigger', 'MenuTrigger'],
  ['DropdownMenu', 'Menu'],
]

/** `<Name asChild>{element}</Name>` becomes `<Into render={element} />`. */
const toRender = (source, name, into) =>
  source.replace(
    new RegExp(`<${name} asChild>\\s*([\\s\\S]*?)\\s*</${name}>`, 'g'),
    (_, inner) => {
      let element = inner.trim()
      if (element.startsWith('{') && element.endsWith('}'))
        element = element.slice(1, -1).trim()
      return `<${into} render={${element}} />`
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

const menus = (source) => {
  let next = toRender(source, 'DropdownMenuTrigger', 'MenuTrigger')
  next = eachOpeningTag(next, 'DropdownMenuItem', (tag) =>
    tag
      .replace('onSelect=', 'onClick=')
      .replace(
        /\s+className="gap-2 text-destructive focus:text-destructive"/,
        ' variant="danger"',
      )
      .replace(/\s+className="gap-2"/, ''),
  )
  for (const [from, to] of RENAMES)
    next = next.replace(new RegExp(`\\b${from}\\b`, 'g'), to)
  return next
}

const popovers = (source) =>
  toRender(source, 'PopoverTrigger', 'PopoverTrigger')

let files = process.argv.slice(2)
let rewrite = menus
if (files[0] === '--popover') {
  files = files.slice(1)
  rewrite = popovers
}
for (const file of files) {
  const before = readFileSync(file, 'utf8')
  const after = rewrite(before)
  if (after !== before) {
    writeFileSync(file, after)
    console.log('rewrote', file)
  }
}
