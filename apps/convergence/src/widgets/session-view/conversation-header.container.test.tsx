import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConversationHeader,
  type HeaderSlot,
} from './conversation-header.container'

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

  it('C a focused control that yields hands focus to More, not to the page — mutation drop the yielded-focus rule turns red', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute('data-conversation-header'))
          return { width: 700 } as DOMRect
        const id = this.getAttribute('data-header-inner')
        if (id === 'terminal') return { width: 100 } as DOMRect
        if (id === 'activity') return { width: 600 } as DOMRect
        return { width: 0 } as DOMRect
      },
    )
    const terminal: HeaderSlot = {
      id: 'terminal',
      side: 'right',
      group: 'control',
      node: <button type="button">Terminal</button>,
      entries: [
        { kind: 'action', key: 'terminal', label: 'Terminal', onSelect() {} },
      ],
    }
    const activity: HeaderSlot = {
      id: 'activity',
      side: 'left',
      group: 'status',
      node: <span>Working on something long</span>,
    }
    const view = render(
      <ConversationHeader
        projectName="cvg"
        conversationName="Hi"
        slots={[terminal]}
        moreContent={null}
      />,
    )
    const button = document.querySelector<HTMLElement>(
      '[data-header-inner="terminal"] button',
    )!
    expect(button.closest('[data-yielded]')).toBeNull()
    button.focus()

    // A wide status item arrives; the terminal yields under the focus.
    view.rerender(
      <ConversationHeader
        projectName="cvg"
        conversationName="Hi"
        slots={[activity, terminal]}
        moreContent={null}
      />,
    )
    expect(button.closest('[data-yielded]')).not.toBeNull()
    expect(document.activeElement).toBe(
      document.querySelector('[data-header-more]'),
    )
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
