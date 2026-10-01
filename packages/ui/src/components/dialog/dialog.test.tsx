import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Dialog, DialogContent, type DialogSize, DialogTitle } from './dialog'

/**
 * DialogContent's two choices (MAR-3616), and the promise attached to them:
 * with neither passed, a dialog has the scrim and the ✕ every dialog has, at
 * today's 720 px.
 */

const backdrop = () =>
  document.querySelector('[data-slot="dialog-backdrop"]') as HTMLElement

const open = (props: { showClose?: boolean; size?: DialogSize } = {}) =>
  render(
    <Dialog open>
      <DialogContent {...props}>
        <DialogTitle>Rename</DialogTitle>
        <p>body</p>
      </DialogContent>
    </Dialog>,
  )

afterEach(cleanup)

describe('MAR-3616: DialogContent', () => {
  it('no props: the scrim, the ✕ and the default width', async () => {
    open()
    const dialog = await screen.findByRole('dialog', { name: 'Rename' })
    // Mutation: default `showClose` to false -> every dialog that relies on
    // the built-in close loses it, red here.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    // The scrim is the token (black at 55% over a light blur), not a colour
    // typed at the call site.
    expect(backdrop().className).toContain('bg-scrim')
    expect(backdrop().className).toContain('backdrop-blur-scrim')
    expect(dialog).toHaveAttribute('data-size', 'lg')
  })

  it('showClose={false}: no built-in close, for a dialog that brings its own', async () => {
    open({ showClose: false })
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('size reaches the box, as data-size', async () => {
    open({ size: '2xl' })
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('data-size', '2xl')
  })

  it('the scrim and the box never drag the window (MAR-3284)', async () => {
    open()
    const dialog = await screen.findByRole('dialog')
    expect(backdrop().className).toContain('app-no-drag')
    expect(dialog.className).toContain('app-no-drag')
  })
})
