import type {
  StudioApi,
  DaemonStatusView,
  ConversationSnapshot,
} from './studio-api.types'
import { readCapturedDaemonHandshake } from './captured-daemon-handshake.pure'

export const fixtureDaemon: DaemonStatusView = {
  ...readCapturedDaemonHandshake(),
  endpointName: 'backpack.automations',
  detail: null,
  advertisedProviders: ['claude'],
  providerMissing: false,
}
export const fixtureSnapshot: ConversationSnapshot = {
  id: 'saved-1',
  title: 'A saved conversation',
  createdAt: '2026-09-07T10:00:00Z',
  updatedAt: '2026-09-07T10:01:00Z',
  status: 'idle',
  items: [
    {
      id: 'answer',
      kind: 'message',
      actor: 'assistant',
      label: 'Agent',
      text: 'The saved answer',
      state: 'complete',
    },
  ],
  streamError: null,
  unreadableTailLines: 0,
  orphanPatches: 0,
}

/** Renderer test double only; production consumes the preload contract. */
export function createStudioApiFixture(
  overrides: Partial<StudioApi> = {},
): StudioApi {
  return {
    platform: 'test',
    updates: {
      getState: async () => ({ status: 'idle' }),
      check: async () => {},
      download: async () => {},
      install: async () => {},
      subscribe: () => () => {},
    },
    getStartup: async () => ({
      kind: 'ready',
      providerId: 'claude',
      daemon: fixtureDaemon,
    }),
    getDaemonStatus: async () => fixtureDaemon,
    listConversations: async () => [],
    getTranscript: async () => fixtureSnapshot,
    startConversation: async () => ({
      kind: 'started',
      conversationId: fixtureSnapshot.id,
    }),
    sendMessage: async () => ({ kind: 'sent' }),
    onConversationEvent: () => () => {},
    onDaemonStatus: () => () => {},
    ...overrides,
  }
}
