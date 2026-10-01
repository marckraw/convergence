import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogTitle } from '../components/dialog/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu/dropdown-menu'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/tooltip/tooltip'

const componentsRoot = resolve(__dirname, '../components')
const stylesheet = readFileSync(join(__dirname, 'theme.css'), 'utf8')
const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8')
const primitives = ['tooltip', 'dropdown-menu', 'popover', 'select', 'dialog']
const pluginTokens =
  /animate-in|animate-out|fade-in-|fade-out-|zoom-in-|zoom-out-|slide-in-from-|slide-out-to-/

describe('MAR-3319: surface motion has real stylesheet definitions', () => {
  it('every animation used by a primitive has one theme entry and matching keyframes', () => {
    const names = new Set(
      primitives.flatMap((name) =>
        Array.from(
          readFileSync(
            join(componentsRoot, name, `${name}.tsx`),
            'utf8',
          ).matchAll(/\banimate-([a-z-]+)/g),
          (match) => match[1],
        ).filter((name) => name !== 'none'),
      ),
    )
    expect([...names].sort()).toEqual([
      'pop-in',
      'pop-out',
      'slide-in-bottom',
      'slide-in-left',
      'slide-in-right',
      'slide-in-top',
    ])
    const theme = Array.from(
      stylesheet.matchAll(/@theme(?:\s+inline)?\s*\{([^}]+)\}/g),
      (match) => match[1],
    ).join('\n')
    for (const name of names) {
      const declarations = Array.from(
        theme.matchAll(new RegExp(`--animate-${name}:\\s*([^;]+);`, 'g')),
      )
      expect(declarations, `${name} theme entry`).toHaveLength(1)
      expect(declarations[0][1]).toMatch(new RegExp(`\\b${name}\\s`))
      expect(
        Array.from(
          stylesheet.matchAll(new RegExp(`@keyframes\\s+${name}\\s*\\{`, 'g')),
        ),
        `${name} keyframes`,
      ).toHaveLength(1)
    }
  })

  it('the pop and the arrivals keep 150 ms in, 100 ms out, a 95% scale and 8 px of travel, as tokens (MAR-3615)', () => {
    // The values live in tokens.css, so reduced motion can zero the travel
    // and the scale in one place; the theme names them.
    expect(tokens).toMatch(/--motion-fast:\s*150ms;/)
    expect(tokens).toMatch(/--motion-exit:\s*100ms;/)
    expect(tokens).toMatch(/--motion-ease-enter:\s*ease-out;/)
    expect(tokens).toMatch(/--motion-ease-exit:\s*ease-in;/)
    expect(tokens).toMatch(/--motion-scale-from:\s*0\.95;/)
    expect(tokens).toMatch(/--motion-shift:\s*8px;/)

    expect(stylesheet).toMatch(
      /--animate-pop-in:\s*pop-in var\(--motion-fast\) var\(--motion-ease-enter\) both;/,
    )
    expect(stylesheet).toMatch(
      /--animate-pop-out:\s*pop-out var\(--motion-exit\) var\(--motion-ease-exit\) both;/,
    )
    for (const name of ['pop-in', 'pop-out']) {
      const body = stylesheet
        .split(`@keyframes ${name} {`)[1]
        .split('@keyframes')[0]
      expect(body).toContain('scale: var(--motion-scale-from);')
      expect(body).toContain('scale: 1;')
      expect(body).toContain('opacity: 0;')
      expect(body).toContain('opacity: 1;')
      // Dialog centering uses translate; pop must not animate that property.
      expect(body).not.toMatch(/\b(?:transform|translate):/)
    }
    for (const [side, travel] of [
      ['top', 'translateY(calc(-1 * var(--motion-shift)))'],
      ['bottom', 'translateY(var(--motion-shift))'],
      ['left', 'translateX(calc(-1 * var(--motion-shift)))'],
      ['right', 'translateX(var(--motion-shift))'],
    ]) {
      expect(stylesheet).toMatch(
        new RegExp(
          `--animate-slide-in-${side}:\\s*pop-in var\\(--motion-fast\\) var\\(--motion-ease-enter\\) both,\\s*slide-in-${side} var\\(--motion-fast\\) var\\(--motion-ease-enter\\) both;`,
        ),
      )
      const body = stylesheet
        .split(`@keyframes slide-in-${side} {`)[1]
        .split('@keyframes')[0]
      expect(body).toContain(`transform: ${travel};`)
      expect(body).toContain('transform: translate(0);')
      expect(body).toContain('opacity: 0;')
      expect(body).toContain('opacity: 1;')
    }
  })
})

const fixtures = [
  [
    'tooltip',
    createElement(
      TooltipProvider,
      null,
      createElement(
        Tooltip,
        { open: true },
        createElement(TooltipTrigger, null, 'Open'),
        createElement(TooltipContent, { id: 'motion-surface' }, 'Tip'),
      ),
    ),
  ],
  [
    'dropdown-menu',
    createElement(
      DropdownMenu,
      { open: true },
      createElement(DropdownMenuTrigger, null, 'Open'),
      createElement(
        DropdownMenuContent,
        { id: 'motion-surface' },
        createElement(DropdownMenuItem, null, 'Item'),
      ),
    ),
  ],
  [
    'popover',
    createElement(
      Popover,
      { open: true },
      createElement(PopoverTrigger, null, 'Open'),
      createElement(PopoverContent, { id: 'motion-surface' }, 'Body'),
    ),
  ],
  [
    'select',
    createElement(
      Select,
      { open: true },
      createElement(SelectTrigger, null, 'Open'),
      createElement(
        SelectContent,
        { id: 'motion-surface', position: 'popper' },
        createElement(SelectItem, { value: 'one' }, 'One'),
      ),
    ),
  ],
  [
    'dialog',
    createElement(
      Dialog,
      { open: true },
      createElement(
        DialogContent,
        { id: 'motion-surface', 'aria-describedby': undefined },
        createElement(DialogTitle, null, 'Dialog'),
      ),
    ),
  ],
] as const

describe('MAR-3319: rendered surface motion', () => {
  it.each(fixtures)(
    '%s carries app-owned motion and honours reduced motion',
    async (_name, fixture) => {
      render(fixture)
      const surface = document.getElementById('motion-surface')!
      expect(surface).not.toBeNull()
      const classes = surface.className.split(/\s+/)
      expect(classes).toContain('animate-pop-in')
      expect(classes).toContain(
        'motion-safe:data-[state=closed]:animate-pop-out',
      )
      expect(classes).toContain('motion-reduce:animate-none')
      expect(surface.className).not.toMatch(pluginTokens)
      // Radix suppresses animation inline until its popper is positioned.
      await waitFor(() => expect(surface.style.animation).toBe(''))
      // Attribute selectors are more specific than the reduced-motion class.
      // Guard every conditional animation so none can override animate-none.
      for (const token of classes.filter(
        (token) => token.includes('data-') && token.includes(':animate-'),
      )) {
        expect(token).toMatch(/^motion-safe:/)
      }
      if (['tooltip', 'popover', 'select'].includes(_name)) {
        for (const [side, from] of [
          ['bottom', 'top'],
          ['top', 'bottom'],
          ['left', 'right'],
          ['right', 'left'],
        ]) {
          expect(classes).toContain(
            `motion-safe:data-[side=${side}]:animate-slide-in-${from}`,
          )
        }
      }
    },
  )
})
