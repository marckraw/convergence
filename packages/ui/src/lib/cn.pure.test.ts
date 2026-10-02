import { describe, expect, it } from 'vitest'
import { cn } from './cn.pure'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const isActive = false
    expect(cn('foo', isActive && 'bar', 'baz')).toBe('foo baz')
  })

  it('resolves Tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })
})

/**
 * The theme's own names (MAR-3615 DS2). Each pair is one a part will write
 * while DS3 and DS4 move the app from Tailwind's names to the tokens: the old
 * and the new name for one property must not both survive.
 */
describe('cn with the Convergence theme', () => {
  it('keeps a small text step and a text colour side by side', () => {
    expect(cn('text-2xs text-ink')).toBe('text-2xs text-ink')
    expect(cn('text-3xs', 'text-ink-muted')).toBe('text-3xs text-ink-muted')
    expect(cn('text-2xs', 'text-danger-ink')).toBe('text-2xs text-danger-ink')
    expect(cn('text-code', 'text-foreground')).toBe('text-code text-foreground')
  })

  it('lets the last text step win', () => {
    expect(cn('text-xs', 'text-2xs')).toBe('text-2xs')
    expect(cn('text-2xs', 'text-3xs')).toBe('text-3xs')
    expect(cn('text-3xs', 'text-sm')).toBe('text-sm')
  })

  it('lets the last colour win', () => {
    expect(cn('bg-surface', 'bg-raised')).toBe('bg-raised')
    expect(cn('text-muted-foreground', 'text-ink-muted')).toBe('text-ink-muted')
    expect(cn('border-border/70', 'border-line-soft')).toBe('border-line-soft')
  })

  it('knows the small steps’ own line heights and the eyebrow tracking', () => {
    expect(cn('leading-tight', 'leading-2xs')).toBe('leading-2xs')
    expect(cn('leading-2xs', 'leading-3xs')).toBe('leading-3xs')
    expect(cn('tracking-wide', 'tracking-eyebrow')).toBe('tracking-eyebrow')
    // A line height is not a size: both stay.
    expect(cn('text-2xs', 'leading-2xs')).toBe('text-2xs leading-2xs')
  })

  it('knows the elevation names are shadows, not shadow colours', () => {
    expect(cn('shadow-md', 'shadow-raised')).toBe('shadow-raised')
    expect(cn('shadow-sm', 'shadow-control')).toBe('shadow-control')
    expect(cn('shadow-raised', 'shadow-overlay')).toBe('shadow-overlay')
    expect(cn('shadow-sheet', 'shadow-sheet-open')).toBe('shadow-sheet-open')
    expect(cn('shadow-xl', 'shadow-floating')).toBe('shadow-floating')
  })

  it('keeps a shadow beside its colour', () => {
    expect(cn('shadow-raised', 'shadow-black/15')).toBe(
      'shadow-raised shadow-black/15',
    )
    expect(cn('shadow-halo', 'shadow-success-solid/16')).toBe(
      'shadow-halo shadow-success-solid/16',
    )
  })

  it('knows the control heights', () => {
    expect(cn('h-control-sm', 'h-8')).toBe('h-8')
    expect(cn('h-9', 'h-control-lg')).toBe('h-control-lg')
    expect(cn('size-control-xs', 'size-control-md')).toBe('size-control-md')
    expect(cn('min-h-control-md', 'min-h-0')).toBe('min-h-0')
  })

  it('knows the motion names', () => {
    expect(cn('duration-fast', 'duration-150')).toBe('duration-150')
    expect(cn('duration-200', 'duration-panel')).toBe('duration-panel')
    expect(cn('duration-exit', 'duration-slow')).toBe('duration-slow')
    expect(cn('ease-enter', 'ease-out')).toBe('ease-out')
    expect(cn('ease-in', 'ease-exit')).toBe('ease-exit')
    expect(cn('ease-guide', 'ease-linear')).toBe('ease-linear')
    expect(cn('transition-colors', 'transition-layout')).toBe(
      'transition-layout',
    )
    expect(cn('transition-layout', 'transition-none')).toBe('transition-none')
  })

  it('knows the card grids are column templates', () => {
    expect(cn('grid-cols-2', 'grid-cols-fill-65')).toBe('grid-cols-fill-65')
    expect(cn('grid-cols-fit-80', 'grid-cols-1')).toBe('grid-cols-1')
    expect(cn('grid-cols-fill-65', 'grid-cols-fit-90')).toBe('grid-cols-fit-90')
  })

  it('knows the named transitions: what moves', () => {
    expect(cn('transition-all', 'transition-motion')).toBe('transition-motion')
    expect(cn('transition-motion', 'transition-opacity')).toBe(
      'transition-opacity',
    )
    expect(cn('transition-size', 'transition-fill')).toBe('transition-fill')
    // A duration is not what moves: both stay.
    expect(cn('transition-size', 'duration-panel')).toBe(
      'transition-size duration-panel',
    )
  })

  it('keeps motion that only applies in another state', () => {
    expect(cn('duration-panel', 'data-[state=closed]:duration-exit')).toBe(
      'duration-panel data-[state=closed]:duration-exit',
    )
  })

  it('knows the layout widths', () => {
    expect(cn('max-w-conversation', 'max-w-2xl')).toBe('max-w-2xl')
    expect(cn('max-w-lg', 'max-w-dialog')).toBe('max-w-dialog')
    expect(cn('w-80', 'w-side-panel')).toBe('w-side-panel')
    expect(cn('w-side-panel', 'w-work-panel')).toBe('w-work-panel')
    expect(cn('max-h-[80vh]', 'max-h-dialog')).toBe('max-h-dialog')
    expect(cn('max-h-dialog', 'max-h-dialog-tall')).toBe('max-h-dialog-tall')
    expect(cn('h-full', 'h-dialog-tall')).toBe('h-dialog-tall')
    expect(cn('max-w-dialog', 'max-w-dialog-sm')).toBe('max-w-dialog-sm')
    expect(cn('max-w-dialog-2xl', 'max-w-none')).toBe('max-w-none')
    expect(cn('max-w-sm', 'max-w-picker')).toBe('max-w-picker')
    expect(cn('max-h-96', 'max-h-picker')).toBe('max-h-picker')
  })

  it('knows the blurs', () => {
    expect(cn('backdrop-blur-xl', 'backdrop-blur-glass')).toBe(
      'backdrop-blur-glass',
    )
    expect(cn('backdrop-blur-sm', 'backdrop-blur-scrim')).toBe(
      'backdrop-blur-scrim',
    )
  })

  it('knows the radii, which keep Tailwind’s names', () => {
    expect(cn('rounded', 'rounded-lg')).toBe('rounded-lg')
    expect(cn('rounded-sm', 'rounded-full')).toBe('rounded-full')
  })
})
