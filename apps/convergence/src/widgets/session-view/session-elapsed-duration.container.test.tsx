import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetConversationLoadsForTests,
  resetLiveConversationTextForTests,
  useSessionStore,
  type ConversationItem,
} from '@/entities/session'
import {
  formatConversationTotalDuration,
  readStreamingDurationTarget,
} from './conversation-total-duration.pure'
import { SessionElapsedDuration } from './session-elapsed-duration.container'

const T0 = '2026-04-22T00:00:00.000Z'
const T1 = '2026-04-22T00:00:10.000Z'

type MessageItem = Extract<ConversationItem, { kind: 'message' }>

function item(
  overrides: Partial<MessageItem> &
    Pick<MessageItem, 'id' | 'createdAt' | 'updatedAt'>,
): MessageItem {
  return {
    sessionId: 'session-1',
    sequence: 1,
    turnId: 'turn-a',
    kind: 'message',
    state: 'complete',
    actor: 'assistant',
    text: 'hi',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
    ...overrides,
  }
}

function readingOf(items: ConversationItem[]) {
  return {
    label: formatConversationTotalDuration(items),
    ...readStreamingDurationTarget(items),
  }
}

function elapsedValue() {
  return (
    screen
      .queryByTestId('session-total-duration')
      ?.querySelector('span:last-child')?.textContent ?? null
  )
}

function append(
  reply: MessageItem,
  shown: { length: number },
  chunk: string,
  updatedAt: string,
) {
  act(() => {
    useSessionStore.getState().handleConversationPatched({
      op: 'append',
      sessionId: 'session-1',
      itemId: reply.id,
      baseLength: shown.length,
      append: chunk,
      updatedAt,
    })
  })
  shown.length += chunk.length
}

describe('SessionElapsedDuration', () => {
  beforeEach(() => {
    resetLiveConversationTextForTests()
    resetConversationLoadsForTests()
    useSessionStore.setState(useSessionStore.getInitialState())
  })

  it('rising Elapsed counts each append for 3 minutes past the turn start', () => {
    const user = item({
      id: 'user',
      actor: 'user',
      createdAt: T0,
      updatedAt: T0,
      text: 'go',
    })
    const reply = item({
      id: 'reply',
      state: 'streaming',
      createdAt: T1,
      updatedAt: T1,
      text: 'hello',
    })
    const items = [user, reply]
    useSessionStore.setState({
      activeSessionId: 'session-1',
      activeConversationSessionId: 'session-1',
      activeConversation: items,
    })
    const view = render(<SessionElapsedDuration {...readingOf(items)} />)
    expect(elapsedValue()).toBe('10s')

    const shown = { length: reply.text.length }
    append(reply, shown, ' one', '2026-04-22T00:01:10.000Z')
    expect(elapsedValue()).toBe('1m 10s')
    append(reply, shown, ' two', '2026-04-22T00:02:10.000Z')
    expect(elapsedValue()).toBe('2m 10s')
    append(reply, shown, ' three', '2026-04-22T00:03:10.000Z')
    const atLastAppend = elapsedValue()
    expect(atLastAppend).toBe('3m 10s')

    act(() => {
      useSessionStore.getState().handleConversationPatched({
        op: 'patch',
        sessionId: 'session-1',
        item: {
          ...reply,
          state: 'complete',
          updatedAt: '2026-04-22T00:03:10.000Z',
        },
      })
    })
    view.rerender(
      <SessionElapsedDuration
        {...readingOf(useSessionStore.getState().activeConversation)}
      />,
    )
    expect(elapsedValue()).toBe(atLastAppend)
  })

  it('a first turn under 1s appears once the live extension passes 1s', () => {
    const reply = item({
      id: 'reply',
      state: 'streaming',
      createdAt: T0,
      updatedAt: '2026-04-22T00:00:00.400Z',
      text: 'hi',
    })
    useSessionStore.setState({
      activeSessionId: 'session-1',
      activeConversationSessionId: 'session-1',
      activeConversation: [reply],
    })
    render(<SessionElapsedDuration {...readingOf([reply])} />)
    expect(elapsedValue()).toBeNull()

    const shown = { length: reply.text.length }
    append(reply, shown, ' more', '2026-04-22T00:00:00.900Z')
    expect(elapsedValue()).toBeNull()
    append(reply, shown, ' again', '2026-04-22T00:00:01.100Z')
    expect(elapsedValue()).toBe('1s')
  })
})
