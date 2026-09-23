import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useResponseAnnotationStore } from '@/entities/response-annotation'
import { AnnotationTray } from './annotation-tray.container'
import { AnnotationStrip } from './annotation-strip.presentational'
import { fourteenAnnotationDrafts } from './annotation-strip-payload.fixture'
import { toPillBody, toPillQuote } from './annotation-strip.pure'

/**
 * The RESPONDING TO strip, rendered (MAR-3004; the MAR-2280 law).
 *
 * Fourteen annotations used to stack a screen tall. The height budget is a
 * STRUCTURE here, not a pixel number jsdom would happily lie about: one scroll
 * container that never wraps, one compact pill per annotation, and exactly
 * one of them expanded at a time.
 */

const SESSION_ID = 'session-strip'

const DRAFTS = fourteenAnnotationDrafts({
  latest: 'msg-latest',
  earlier: 'msg-earlier',
})

function seedFourteen() {
  for (const draft of DRAFTS) {
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

function pill(name: RegExp | string) {
  return within(strip()).getByRole('button', { name })
}

function chip() {
  return screen.getByTestId('annotation-chip')
}

/**
 * The document's Tab order. jsdom does not move focus on Tab, so this reads
 * the order a browser follows when no tabindex is positive: every focusable
 * control whose tabIndex is not negative, in document order.
 */
function tabOrder(): HTMLElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>(
      'button, input, textarea, select, a[href], [tabindex]',
    ),
  ).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled'),
  )
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

  it('shows the pills in the order they will be sent', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    // The compiler reads the store, not the DOM, so a view-only sort would
    // leave the payload intact — and still show the human a different send
    // order than the one that goes out.
    const shown = pills()
    DRAFTS.forEach((draft, index) => {
      expect(shown[index]).toBe(
        pill(`${toPillQuote(draft.quotedText)} ${toPillBody(draft.body)}`),
      )
    })
  })

  it('counts the annotations in live text, honest about the number', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    const badge = screen.getByText('14 annotations')
    expect(badge).toHaveAttribute('aria-live', 'polite')
  })

  it('names each pill by what it shows, so a 👍 and a comment on one quote differ', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    const reaction = pill('I rewrote the scheduler 👍')
    const comment = pill(
      'I rewrote the scheduler so… Why exponential rather than…',
    )
    expect(reaction).not.toBe(comment)
    expect(reaction).not.toHaveAttribute('aria-label')
  })

  it('expands exactly one pill in place, and another click moves the expansion', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(pill(/^The migration Name/))
    expect(screen.getAllByTestId('annotation-chip')).toHaveLength(1)
    expect(pills()).toHaveLength(13)

    fireEvent.click(pill(/^about a second/))
    expect(screen.getAllByTestId('annotation-chip')).toHaveLength(1)
    expect(pills()).toHaveLength(13)
    // The first one is compact again.
    expect(pill(/^The migration Name/)).toHaveAttribute('data-annotation-pill')
  })

  it('takes the keyboard into the chip it opens, and Escape brings it back to the pill', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(pill(/^The migration Name/))
    // Precondition: the press that follows starts inside the open chip, as a
    // keyboard user's would — not on a node the test picked.
    expect(chip()).toContainElement(document.activeElement as HTMLElement)

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    expect(screen.queryAllByTestId('annotation-chip')).toHaveLength(0)
    expect(pills()).toHaveLength(14)
    expect(document.activeElement).toBe(pill(/^The migration Name/))
  })

  it('keeps arrows, Home and End inside the edit field for the caret', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(pill(/^The migration Name/))
    fireEvent.click(within(chip()).getByLabelText(/^Edit response to/))
    const field = screen.getByLabelText<HTMLInputElement>(/^Edit response to/)
    fireEvent.change(field, { target: { value: 'Draft in progress' } })
    expect(document.activeElement).toBe(field)

    for (const keystroke of [
      { key: 'ArrowLeft' },
      { key: 'ArrowRight' },
      { key: 'Home' },
      { key: 'End' },
      { key: 'ArrowLeft', shiftKey: true },
      { key: 'ArrowLeft', metaKey: true },
    ]) {
      expect(fireEvent.keyDown(field, keystroke)).toBe(true)
      expect(document.activeElement).toBe(field)
    }
    expect(field.value).toBe('Draft in progress')
  })

  it('leaves textarea navigation keys to the caret inside an expanded strip item', () => {
    seedFourteen()
    const annotations =
      useResponseAnnotationStore.getState().annotationsBySessionId[SESSION_ID]!
    const expandedId = annotations[1]!.id
    render(
      <AnnotationStrip
        annotations={annotations}
        expandedId={expandedId}
        tabStopId={expandedId}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onPillFocus={vi.fn()}
        renderExpanded={() => (
          <textarea
            aria-label="Annotation response"
            defaultValue="Draft in progress"
          />
        )}
      />,
    )
    const field = within(strip()).getByRole('textbox', {
      name: 'Annotation response',
    })
    field.focus()
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(fireEvent.keyDown(field, { key })).toBe(true)
      expect(document.activeElement).toBe(field)
    }
    expect(field).toHaveValue('Draft in progress')

    const [first] = pills()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'End' })
    expect(document.activeElement).toBe(pills().at(-1))
  })

  it('leaves a modified arrow on a pill alone', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    const [first, second] = pills()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight', shiftKey: true })
    expect(document.activeElement).toBe(first)
    // The unmodified press does move — the pill is not simply inert.
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)
  })

  it('discards an edit on the first Escape and collapses on the second', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(pill(/^The migration Name/))
    fireEvent.click(within(chip()).getByLabelText(/^Edit response to/))
    fireEvent.change(screen.getByLabelText(/^Edit response to/), {
      target: { value: 'An edit nobody saved.' },
    })

    fireEvent.keyDown(screen.getByLabelText(/^Edit response to/), {
      key: 'Escape',
    })
    // First stage: the draft is gone, the chip is still open, and the
    // keyboard is on it so the second Escape has somewhere to start.
    expect(screen.queryByDisplayValue('An edit nobody saved.')).toBeNull()
    expect(chip()).toHaveTextContent('Name the table it touches.')
    expect(chip()).toContainElement(document.activeElement as HTMLElement)

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryAllByTestId('annotation-chip')).toHaveLength(0)
    expect(document.activeElement).toBe(pill(/^The migration Name/))
  })

  it('removes one annotation with its ✕ and the badge counts thirteen', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    fireEvent.click(pill(/^The migration Name/))
    fireEvent.click(screen.getByLabelText('Remove response to “The migration”'))

    expect(screen.getByText('13 annotations')).toBeInTheDocument()
    expect(within(strip()).getAllByRole('listitem')).toHaveLength(13)
  })

  it('hands the keyboard to the next pill after a ✕', () => {
    seedFourteen()
    render(<AnnotationTray sessionId={SESSION_ID} />)

    // The seventh of fourteen; the eighth is the CRLF quote.
    const seventh = pills()[6]!
    expect(seventh).toBe(pill(/^single transaction/))
    fireEvent.click(seventh)
    fireEvent.click(within(chip()).getByLabelText(/^Remove response to/))

    expect(pills()).toHaveLength(13)
    expect(document.activeElement).toBe(pill(/^A quote with a Windows/))
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

  it('is one Tab stop, which follows the arrows', () => {
    seedFourteen()
    render(
      <>
        <button type="button">Before the strip</button>
        <AnnotationTray sessionId={SESSION_ID} />
        <button type="button">After the strip</button>
      </>,
    )
    const before = screen.getByRole('button', { name: 'Before the strip' })
    const after = screen.getByRole('button', { name: 'After the strip' })
    const [first, , third] = pills()

    // Tab from before the strip lands on one pill; the next Tab leaves it.
    expect(tabOrder()).toEqual([before, first, after])

    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(third)
    // Shift+Tab back into the row returns where the arrows left it.
    expect(tabOrder()).toEqual([before, third, after])
  })

  it('takes no room when nothing is pending', () => {
    render(<AnnotationTray sessionId={SESSION_ID} />)
    expect(screen.queryByTestId('annotation-tray')).not.toBeInTheDocument()
  })
})
