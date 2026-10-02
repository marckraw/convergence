import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { focusRing } from '../../lib/focus-ring.styles'
import { press } from '../../motion/press/press.styles'
import { IconButton } from '../icon-button/icon-button'
import { Tooltip } from '../tooltip/tooltip'
import { Button, buttonVariants } from './button'

const classesOf = (value: string) => value.split(/\s+/)

describe('buttonVariants (MAR-3616)', () => {
  it('defaults to a primary button of the middle size, md', () => {
    expect(buttonVariants()).toBe(
      buttonVariants({ variant: 'primary', size: 'md' }),
    )
  })

  it.each([
    ['xs', 'h-6'],
    ['sm', 'h-7'],
    ['md', 'h-8'],
    ['lg', 'h-9'],
  ] as const)(
    'draws %s at %s, one scale for every control (R3)',
    (size, height) => {
      expect(classesOf(buttonVariants({ size }))).toContain(height)
      expect(classesOf(buttonVariants({ size, shape: 'icon' }))).toContain(
        `size-${height.slice(2)}`,
      )
    },
  )

  it.each(['xs', 'sm', 'md', 'lg'] as const)(
    'gives a link no box at size %s: no height, padding or text size',
    (size) => {
      expect(buttonVariants({ variant: 'link', size })).not.toMatch(
        /(^| )(h|size|px|py)-|(^| )text-(xs|sm|\[)/,
      )
    },
  )

  it('carries the ring, the press and no-drag in every variant', () => {
    for (const variant of [
      'primary',
      'secondary',
      'tonal',
      'ghost',
      'quiet',
      'link',
      'danger',
      'danger-quiet',
    ] as const) {
      const classes = classesOf(buttonVariants({ variant }))
      expect(classes).toEqual(expect.arrayContaining(classesOf(focusRing)))
      expect(classes).toEqual(expect.arrayContaining(classesOf(press)))
      expect(classes).toContain('app-no-drag')
    }
  })

  it('outlines secondary in the control border, which clears 3:1 (MAR-3460, DS-16)', () => {
    const classes = classesOf(buttonVariants({ variant: 'secondary' }))
    expect(classes).toContain('border-control-line')
    expect(classes).not.toContain('border-control-fill')
  })
})

describe('Button', () => {
  it('says its size, and never takes a native title', () => {
    render(<Button size="sm">Send</Button>)
    const button = screen.getByRole('button', { name: 'Send' })
    expect(button).toHaveAttribute('data-size', 'sm')
    expect(button).not.toHaveAttribute('title')
  })

  it('keeps an unavailable control focusable and says why (R2)', () => {
    render(<Button disabledReason="Open a project first">New</Button>)
    const button = screen.getByRole('button', { name: 'New' })
    expect(button).not.toHaveAttribute('disabled')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription('Open a project first')
    expect(button).toHaveAttribute('data-tooltip', 'Open a project first')
  })

  it('puts the reason under a tooltip it already has', () => {
    render(
      <Tooltip label="Open project">
        <Button disabledReason="No editor found">Open</Button>
      </Tooltip>,
    )
    const button = screen.getByRole('button', { name: 'Open' })
    expect(button).toHaveAttribute('data-tooltip', 'Open project')
    expect(button).toHaveAttribute('data-tooltip-detail', 'No editor found')
  })

  it('hears its tooltip as its description, as a native title was heard', () => {
    render(
      <>
        <Tooltip label="Project actions">
          <Button>Run tests</Button>
        </Tooltip>
        <Tooltip label="Expand Loom">
          <Button aria-label="Expand Loom">Expand</Button>
        </Tooltip>
      </>,
    )
    expect(
      screen.getByRole('button', { name: 'Run tests' }),
    ).toHaveAccessibleDescription('Project actions')
    // A tooltip that only repeats the name adds nothing to hear twice.
    expect(
      screen.getByRole('button', { name: 'Expand Loom' }),
    ).not.toHaveAttribute('aria-description')
  })

  it('is busy with aria-busy, and its name says so only when it is', () => {
    const { rerender } = render(
      <Button pending={false} pendingLabel="Saving…">
        Save
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute(
      'aria-busy',
    )
    rerender(
      <Button pending pendingLabel="Saving…">
        Save
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })
})

describe('IconButton', () => {
  it('is named by its label, which is also its tooltip (R2)', () => {
    render(
      <IconButton label="Open settings" shortcut="⌘,">
        <svg aria-hidden />
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Open settings' })
    expect(button).toHaveAttribute('data-tooltip', 'Open settings')
    expect(button).toHaveAttribute('data-tooltip-shortcut', '⌘,')
    expect(button).not.toHaveAttribute('title')
    expect(button).toHaveAttribute('data-size', 'md')
  })

  it('says a toggle’s state with aria-pressed', () => {
    render(
      <IconButton label="Pin sidebar" pressed>
        <svg aria-hidden />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Pin sidebar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
