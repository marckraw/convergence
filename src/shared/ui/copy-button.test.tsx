import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './copy-button'

describe('CopyButton', () => {
  const writeText = vi.fn<(value: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('writes text to the clipboard on click', async () => {
    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('hello'))
  })

  it('shows a copied state after a successful copy and reverts after a timeout', async () => {
    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Copied' }),
      ).toBeInTheDocument(),
    )

    await waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: 'Copy' }),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('does not bubble click events to parent handlers', () => {
    const onParentClick = vi.fn()
    render(
      <div onClick={onParentClick}>
        <CopyButton text="hello" />
      </div>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onParentClick).not.toHaveBeenCalled()
  })
})
