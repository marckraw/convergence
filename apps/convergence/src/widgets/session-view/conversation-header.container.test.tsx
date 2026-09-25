import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationHeader } from './conversation-header.container'

/**
 * Layout as the browser gives it: the header is 1,200 px wide, and a span's
 * `scrollWidth` is its text's width (8 px a character) but never less than the
 * `min-width` it was given -- which is what makes measuring a laid-out name
 * read back the reserve the layout itself applied.
 */
function browserLayout() {
  const measure = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-conversation-header'))
        return { width: 1200 } as DOMRect
      return measure.call(this)
    },
  )
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      const text = (this.textContent ?? '').length * 8
      return Math.max(text, Number.parseFloat(this.style.minWidth) || 0)
    },
  )
}

const header = (projectName: string | null, conversationName: string) => (
  <ConversationHeader
    projectName={projectName}
    conversationName={conversationName}
    slots={[]}
    moreContent={null}
  />
)

const minWidth = (selector: string) =>
  document.querySelector<HTMLElement>(selector)?.style.minWidth

describe('ConversationHeader', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('B a long name followed by a short one gives the reserve back — mutation read from the laid-out span turns red', () => {
    browserLayout()
    const view = render(
      header('a-very-long-project-name', 'A conversation with a long name'),
    )
    expect(minWidth('[data-header-name]')).toBe('120px')
    expect(minWidth('[data-header-project]')).toBe('40px')

    // The same header, still mounted, for another session.
    view.rerender(header('cvg', 'Hi'))
    // "Hi" is 16 px and "cvg" 24 px: the reserve is no more than the names.
    expect(minWidth('[data-header-name]')).toBe('16px')
    expect(minWidth('[data-header-project]')).toBe('24px')
    expect(
      document.querySelector<HTMLElement>('[data-header-identity]')?.style
        .minWidth,
    ).toBe('60px')
  })

  it('I a conversation without a project has no project part at all', () => {
    render(header(null, 'Loose chat'))
    const identity = document.querySelector('[data-header-identity]')!
    expect(identity).toHaveAttribute('aria-label', 'Loose chat')
    expect(identity).toHaveAttribute('title', 'Loose chat')
    expect(identity).toHaveTextContent(/^Loose chat$/)
    expect(document.querySelector('[data-header-project]')).toBeNull()
  })
})
