import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useResponseAnnotationStore } from '@/entities/response-annotation'
import { AnnotationTray } from './annotation-tray.container'
import { fourteenAnnotationDrafts } from './annotation-strip-payload.fixture'

/**
 * The RESPONDING TO strip, rendered (MAR-3004; the MAR-2280 law).
 *
 * Fourteen annotations used to stack a screen tall. The height budget is a
 * STRUCTURE here, not a pixel number jsdom would happily lie about: one scroll
 * container that never wraps, one compact pill per annotation, and exactly
 * one of them expanded at a time.
 */

const SESSION_ID = 'session-strip'

function seedFourteen() {
  for (const draft of fourteenAnnotationDrafts({
    latest: 'msg-latest',
    earlier: 'msg-earlier',
  })) {
    useResponseAnnotationStore.getState().addAnnotation(SESSION_ID, draft)
  }
}

function strip() {
  return screen.getByRole('list', { name: 'Responding to' })
}

function pills() {
  return within(strip())
    .queryAllByRole('button', { name: /./ })
    .filter((button) => button.hasAttribute('data-annotation-pill'))
}

describe('the RESPONDING TO strip', () => {
  beforeEach(() => {
    useResponseAnnotationStore.setState({ annotationsBySessionId: {} })
  })

  it('lays fourteen annotations out as one row that scrolls instead of wrapping', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    const list = strip()
    // One scroll container holding every annotation, and it never wraps:
    // that is the whole of the height budget, stated as structure.
    expect(within(list).getAllByRole('listitem')).toHaveLength(14)
    expect(list.className).toContain('flex-nowrap')
    expect(list.className).toContain('overflow-x-auto')
    expect(list.className).not.toMatch(/\bflex-wrap\b/)
    expect(pills()).toHaveLength(14)
    // Nothing is expanded until someone asks.
    expect(screen.queryAllByTestId('annotation-chip')).toHaveLength(0)
  })

  it('counts the annotations in live text, honest about the number', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    const badge = screen.getByText('14 annotations')
    expect(badge).toHaveAttribute('aria-live', 'polite')
  })

  it('names each pill by the quote it answers', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    expect(
      within(strip()).getByRole('button', { name: 'The migration' }),
    ).toHaveAttribute('data-annotation-pill')
  })

  it('expands exactly one pill in place, and another click moves the expansion', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(
      within(strip()).getByRole('button', { name: 'The migration' }),
    )
    expect(screen.getAllByTestId('annotation-chip')).toHaveLength(1)
    expect(pills()).toHaveLength(13)

    fireEvent.click(
      within(strip()).getByRole('button', { name: 'about a second' }),
    )
    expect(screen.getAllByTestId('annotation-chip')).toHaveLength(1)
    expect(pills()).toHaveLength(13)
    // The first one is compact again.
    expect(
      within(strip()).getByRole('button', { name: 'The migration' }),
    ).toHaveAttribute('data-annotation-pill')
  })

  it('collapses the expanded pill on Escape', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(
      within(strip()).getByRole('button', { name: 'The migration' }),
    )
    fireEvent.keyDown(screen.getByTestId('annotation-chip'), { key: 'Escape' })

    expect(screen.queryAllByTestId('annotation-chip')).toHaveLength(0)
    expect(pills()).toHaveLength(14)
    // The keyboard stays where it was: back on the pill that was open.
    expect(document.activeElement).toBe(
      within(strip()).getByRole('button', { name: 'The migration' }),
    )
  })

  it('removes one annotation with its ✕ and the badge counts thirteen', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(
      within(strip()).getByRole('button', { name: 'The migration' }),
    )
    fireEvent.click(screen.getByLabelText('Remove response to “The migration”'))

    expect(screen.getByText('13 annotations')).toBeInTheDocument()
    expect(within(strip()).getAllByRole('listitem')).toHaveLength(13)
  })

  it('moves focus along the strip with the arrow keys', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    const [first, second] = pills()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)

    fireEvent.keyDown(second!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(first)
  })

  it('takes no room when nothing is pending', () => {
    render(<AnnotationTray sessionId={SESSION_ID} />)
    expect(screen.queryByTestId('annotation-tray')).not.toBeInTheDocument()
  })
})
