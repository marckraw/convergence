import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Dialog, DialogContent } from './dialog'

/**
 * The two optional props MAR-3201 added, and the promise attached to them:
 * with neither passed, the primitive renders what it always rendered.
 */

const overlay = () =>
  document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement

const content = () =>
  document.querySelector('[data-slot="dialog-content"]') as HTMLElement

const open = (
  props: {
    overlayClassName?: string
    hideClose?: boolean
  } = {},
) =>
  render(
    <Dialog open>
      <DialogContent {...props}>
        <p>body</p>
      </DialogContent>
    </Dialog>,
  )

afterEach(cleanup)

describe('MAR-3201 A: DialogContent keeps its old markup by default', () => {
  it('no props: the app’s backdrop, and the built-in close', () => {
    open()
    // Mutation: default `hideClose` to true -> the 27 callers that rely on
    // the built-in close lose it, red here.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(overlay().className).toContain('bg-black/55')
    expect(overlay().className).toContain('backdrop-blur-sm')
  })

  it('overlayClassName reaches the overlay and replaces what it names', () => {
    open({ overlayClassName: 'bg-black/[0.68] backdrop-blur-none' })
    // Mutation: drop the className pass-through on <DialogOverlay /> -> the
    // caller's backdrop never arrives, red.
    expect(overlay().className).toContain('bg-black/[0.68]')
    expect(overlay().className).toContain('backdrop-blur-none')
    expect(overlay().className).not.toContain('bg-black/55')
    expect(overlay().className).not.toContain('backdrop-blur-sm')
    // It is the overlay that changed, not the box.
    expect(content().className).not.toContain('bg-black/[0.68]')
  })

  it('hideClose: no built-in close, for a dialog that brings its own', () => {
    open({ hideClose: true })
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(content().textContent).toBe('body')
  })
})
