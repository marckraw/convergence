import type { ConversationFactItem } from './conversation-prefix.pure'

type FixtureItem = ConversationFactItem & {
  sessionId: string
  agentRunId?: string
  text?: string
  toolName: string
  inputText: string
  providerMeta: {
    providerId: string
    providerItemId: null
    providerEventType: null
  }
}

export function prefixFixtureItem(
  sequence: number,
  turnId: string | null,
  overrides: Partial<FixtureItem> = {},
): FixtureItem {
  return {
    id: `item-${sequence}`,
    sessionId: 'prefix-session',
    sequence,
    turnId,
    kind: 'tool-call',
    state: 'complete',
    toolName: 'Read',
    inputText: '{}',
    createdAt: new Date(1_700_000_000_000 + sequence * 1000).toISOString(),
    updatedAt: new Date(
      1_700_000_000_000 + sequence * 1000 + 500,
    ).toISOString(),
    providerMeta: {
      providerId: 'test',
      providerItemId: null,
      providerEventType: null,
    },
    ...overrides,
  }
}

export function conversationPrefixFixtures(): Record<string, FixtureItem[]> {
  return {
    'one turn of 1000 tool items': Array.from({ length: 1000 }, (_, i) =>
      prefixFixtureItem(i + 1, 'long'),
    ),
    'interleaved child-only turns and missing turn ids': [
      prefixFixtureItem(1, null),
      prefixFixtureItem(2, 'main-a'),
      prefixFixtureItem(3, 'child-only', { agentRunId: 'child' }),
      prefixFixtureItem(4, 'main-b'),
      prefixFixtureItem(5, 'main-a', { agentRunId: 'child' }),
      prefixFixtureItem(6, 'child-only', { agentRunId: 'child' }),
      prefixFixtureItem(7, null, {
        kind: 'message',
        actor: 'assistant',
        text: 'reply',
      }),
      prefixFixtureItem(8, 'main-c'),
    ],
    'newest 300 have no completed reply': [
      prefixFixtureItem(1, 'reply', {
        kind: 'message',
        actor: 'assistant',
        text: 'last reply',
      }),
      ...Array.from({ length: 320 }, (_, i) =>
        prefixFixtureItem(i + 2, `turn-${Math.floor(i / 30)}`),
      ),
    ],
    'timestamp edges': [
      prefixFixtureItem(1, 'a', { createdAt: 'invalid', updatedAt: 'invalid' }),
      prefixFixtureItem(2, 'a', { updatedAt: 'invalid' }),
      prefixFixtureItem(3, 'b', {
        createdAt: '2026-01-01T12:00:00.123+02:00',
        updatedAt: '2026-01-01T12:00:00.987+02:00',
      }),
      prefixFixtureItem(4, 'b', {
        createdAt: '2026-01-01T09:00:00.010Z',
        updatedAt: '2026-01-01T09:00:01.010Z',
      }),
      prefixFixtureItem(5, 'invalid', { createdAt: 'invalid' }),
    ],
  }
}
