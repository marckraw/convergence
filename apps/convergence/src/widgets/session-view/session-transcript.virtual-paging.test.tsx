import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import { SessionTranscript } from './session-transcript.container'
import { useTranscriptViewStore } from './transcript-view.model'

// Real TanStack virtualizer with a deterministic browser layout. This checks
// measured keyed rows as well as the transcript's prepend effect.
afterEach(() => vi.restoreAllMocks())
it.each([false, true])(
  'R8 the real virtualizer holds item 1001 with pinned approval=%s and does not cascade',
  async (pinned) => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === 'session-transcript-scroll-region'
          ? 400
          : this.dataset.testid === 'session-transcript-row'
            ? 50
            : 0
      },
    )
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === 'session-transcript-scroll-region'
          ? 400
          : 0
      },
    )
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return (
          Number.parseFloat(
            this.querySelector<HTMLElement>('.relative.w-full')?.style.height ??
              '0',
          ) + 32
        )
      },
    )
    const scroll = function (this: HTMLElement, options: ScrollToOptions) {
      const next = Math.max(
        0,
        Math.min(
          this.scrollHeight - this.clientHeight,
          options.top ?? this.scrollTop,
        ),
      )
      if (next === this.scrollTop) return
      this.scrollTop = next
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    }
    const previous = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollTo',
    )
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scroll,
    })
    try {
      const session = {
        id: 'real-virtual',
        status: 'completed',
        attention: 'none',
      } as Session
      useTranscriptViewStore.setState({
        modes: { [session.id]: 'full' },
        openBlocks: new Set(),
      })
      const message = (sequence: number): ConversationItem => ({
        id: `real-${sequence}`,
        sessionId: session.id,
        sequence,
        turnId: null,
        kind: 'message',
        actor: 'user',
        state: 'complete',
        text: `message ${sequence}`,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        providerMeta: {
          providerId: 'fake',
          providerItemId: null,
          providerEventType: null,
        },
      })
      const pin = {
        ...message(500),
        kind: 'approval-request',
        description: 'Old pending',
        resolution: 'pending',
      } as ConversationItem
      const current = [
        ...(pinned ? [pin] : []),
        ...Array.from({ length: 30 }, (_, i) => message(1001 + i)),
      ]
      const onLoadOlder = vi.fn()
      const props = {
        session,
        hasOlder: true,
        oldestSequence: 1001,
        onLoadOlder,
        onApprove: vi.fn(),
        onDeny: vi.fn(),
        onInputAnswer: vi.fn(),
      }
      const { rerender } = render(
        <SessionTranscript {...props} conversationItems={current} />,
      )
      const region = screen.getByTestId('session-transcript-scroll-region')
      await waitFor(() => expect(region.scrollTop).toBeGreaterThan(100))
      act(() => {
        region.scrollTop = 35
        fireEvent.scroll(region)
      })
      expect(onLoadOlder).toHaveBeenCalledTimes(1)
      const viewportPosition = () => {
        const row = document.querySelector<HTMLElement>(
          '[data-conversation-item-id="real-1001"]',
        )
        expect(row).not.toBeNull()
        return (
          Number.parseFloat(row!.style.transform.slice('translateY('.length)) -
          region.scrollTop
        )
      }
      const before = viewportPosition()
      rerender(
        <SessionTranscript
          {...props}
          oldestSequence={971}
          conversationItems={[
            ...(pinned ? [pin] : []),
            ...Array.from({ length: 30 }, (_, i) => message(971 + i)),
            ...current.filter((item) => item !== pin),
          ]}
        />,
      )
      await act(async () => {})
      await waitFor(() => expect(viewportPosition()).toBe(before))
      expect(onLoadOlder).toHaveBeenCalledTimes(1)
      act(() => {
        region.scrollTop = 300
        fireEvent.scroll(region)
      })
      act(() => {
        region.scrollTop = 35
        fireEvent.scroll(region)
      })
      expect(onLoadOlder).toHaveBeenCalledTimes(2)
    } finally {
      if (previous)
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', previous)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
    }
  },
)
