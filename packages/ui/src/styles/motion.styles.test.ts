import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogTitle } from '../components/dialog/dialog'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '../components/menu/menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/popover/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '../components/select/select'
import { Sheet, SheetContent } from '../components/sheet/sheet'
import { fadeMotion, growMotion, popupMotion } from '../motion/popup.styles'

const componentsRoot = resolve(__dirname, '../components')
const stylesheet = readFileSync(join(__dirname, 'theme.css'), 'utf8')
const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8')
const popups = ['menu', 'popover', 'select', 'dialog', 'sheet']
const pluginTokens =
  /animate-in|animate-out|fade-in-|fade-out-|zoom-in-|zoom-out-|slide-in-from-|slide-out-to-/

describe('MAR-3616: popups move on transitions, on Base UI’s first and last frames', () => {
  it('no popup plays a keyframe animation: closing midway reverses from where it is', () => {
    for (const name of popups) {
      const source = readFileSync(
        join(componentsRoot, name, `${name}.tsx`),
        'utf8',
      )
      expect(source, name).not.toMatch(/\banimate-(?!none\b)[a-z]/)
      expect(source, name).not.toMatch(pluginTokens)
    }
  })

  it('each motion starts and ends hidden, and leaves faster than it came', () => {
    for (const motion of [popupMotion, growMotion, fadeMotion]) {
      const classes = motion.split(' ')
      expect(classes).toContain('data-starting-style:opacity-0')
      expect(classes).toContain('data-ending-style:opacity-0')
      expect(classes).toContain('duration-fast')
      expect(classes).toContain('data-ending-style:duration-exit')
    }
    // The grow and the travel read the tokens reduced motion zeroes.
    expect(popupMotion).toContain(
      'data-starting-style:scale-(--motion-scale-from)',
    )
    expect(popupMotion).toContain(
      'data-[side=bottom]:data-starting-style:-translate-y-(--motion-shift)',
    )
    expect(growMotion).toContain(
      'data-starting-style:scale-(--motion-scale-from)',
    )
    expect(growMotion).not.toContain('translate-y')
    expect(fadeMotion).not.toContain('scale')
  })

  it('the values are tokens: 150 ms in, 100 ms out, a 95% scale and 8 px of travel, gone under reduced motion (MAR-3615)', () => {
    expect(tokens).toMatch(/--motion-fast:\s*150ms;/)
    expect(tokens).toMatch(/--motion-exit:\s*100ms;/)
    expect(tokens).toMatch(/--motion-ease-enter:\s*ease-out;/)
    expect(tokens).toMatch(/--motion-ease-exit:\s*ease-in;/)
    expect(tokens).toMatch(/--motion-scale-from:\s*0\.95;/)
    expect(tokens).toMatch(/--motion-shift:\s*8px;/)
    for (const block of [
      tokens.split('@media (prefers-reduced-motion: reduce)')[1],
      tokens.split("[data-motion='reduced']")[1],
    ]) {
      const body = block.split('}')[0]
      expect(body).toContain('--motion-shift: 0px;')
      expect(body).toContain('--motion-scale-from: 1;')
    }
    expect(stylesheet).toMatch(
      /--transition-duration-fast:\s*var\(--motion-fast\);/,
    )
    expect(stylesheet).toMatch(
      /--transition-duration-exit:\s*var\(--motion-exit\);/,
    )
    // What moves is named: the fade, the grow and the travel, nothing else.
    expect(stylesheet).toMatch(
      /--transition-property-motion:\s*opacity, scale, translate;/,
    )
  })

  it('the keyframes the app still plays keep their theme entries (conversation actions’ pop)', () => {
    for (const name of ['pop-in', 'pop-out']) {
      expect(stylesheet).toMatch(new RegExp(`--animate-${name}:\\s*${name}\\s`))
      expect(
        Array.from(
          stylesheet.matchAll(new RegExp(`@keyframes\\s+${name}\\s*\\{`, 'g')),
        ),
      ).toHaveLength(1)
    }
  })
})

const fixtures = [
  [
    'menu',
    popupMotion,
    createElement(
      Menu,
      { open: true },
      createElement(MenuTrigger, null, 'Open'),
      createElement(
        MenuContent,
        { id: 'motion-surface' },
        createElement(MenuItem, null, 'Item'),
      ),
    ),
  ],
  [
    'popover',
    popupMotion,
    createElement(
      Popover,
      { open: true },
      createElement(PopoverTrigger, null, 'Open'),
      createElement(
        PopoverContent,
        { id: 'motion-surface', 'aria-label': 'Details' },
        'Body',
      ),
    ),
  ],
  [
    'select',
    popupMotion,
    createElement(
      Select,
      { open: true, items: [{ value: 'one', label: 'One' }] },
      createElement(SelectTrigger, null, 'Open'),
      createElement(
        SelectContent,
        { id: 'motion-surface', alignItemWithTrigger: false },
        createElement(SelectItem, { value: 'one' }, 'One'),
      ),
    ),
  ],
  [
    'dialog',
    growMotion,
    createElement(
      Dialog,
      { open: true },
      createElement(
        DialogContent,
        { id: 'motion-surface' },
        createElement(DialogTitle, null, 'Dialog'),
      ),
    ),
  ],
  [
    'sheet',
    'transition-motion data-starting-style:translate-x-full motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0',
    createElement(
      Sheet,
      { open: true },
      createElement(
        SheetContent,
        { id: 'motion-surface' },
        createElement(DialogTitle, null, 'Sheet'),
      ),
    ),
  ],
] as const

describe('MAR-3616: rendered popup motion', () => {
  it.each(fixtures)(
    '%s wears its motion, and nothing of the old keyframes',
    async (_name, motion, fixture) => {
      render(fixture)
      await screen.findAllByText(/Item|Body|One|Dialog|Sheet/)
      const surface = document.getElementById('motion-surface')!
      expect(surface).not.toBeNull()
      const classes = surface.className.split(/\s+/)
      for (const name of motion.split(' ')) expect(classes).toContain(name)
      expect(surface.className).not.toMatch(/\banimate-/)
      expect(surface.className).not.toMatch(pluginTokens)
    },
  )
})
