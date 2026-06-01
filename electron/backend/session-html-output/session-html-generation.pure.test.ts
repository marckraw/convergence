import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '../session/conversation-item.types'
import type { SessionSummary } from '../session/session.types'
import {
  buildSessionHtmlGenerationPrompt,
  normalizeGeneratedHtml,
} from './session-html-generation.pure'

const session: SessionSummary = {
  id: 'session-1',
  contextKind: 'project',
  projectId: 'project-1',
  workspaceId: null,
  providerId: 'codex',
  model: 'gpt-5',
  effort: 'medium',
  name: 'Explain plan',
  status: 'completed',
  attention: 'finished',
  activity: null,
  contextWindow: null,
  workingDirectory: '/repo',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 2,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:01.000Z',
}

const assistantItem: Extract<ConversationItem, { kind: 'message' }> & {
  actor: 'assistant'
} = {
  id: 'item-2',
  sessionId: 'session-1',
  sequence: 2,
  turnId: 'turn-1',
  kind: 'message',
  state: 'complete',
  actor: 'assistant',
  text: 'Use a secondary agent and keep Markdown canonical.',
  createdAt: '2026-06-01T00:00:01.000Z',
  updatedAt: '2026-06-01T00:00:01.000Z',
  providerMeta: {
    providerId: 'codex',
    providerItemId: null,
    providerEventType: 'assistant',
  },
}

describe('session-html-generation.pure', () => {
  it('builds a prompt with recent conversation and latest assistant text', () => {
    const userItem: Extract<ConversationItem, { kind: 'message' }> = {
      ...assistantItem,
      id: 'item-1',
      sequence: 1,
      actor: 'user',
      text: 'How should HTML mode work?',
    }
    const prompt = buildSessionHtmlGenerationPrompt({
      session,
      conversation: [userItem, assistantItem],
      sourceItem: assistantItem,
    })

    expect(prompt).toContain('Return only HTML')
    expect(prompt).toContain('No living HTML exists yet.')
    expect(prompt).toContain('USER: How should HTML mode work?')
    expect(prompt).toContain(
      'Use a secondary agent and keep Markdown canonical.',
    )
  })

  it('includes current living HTML when updating an existing page', () => {
    const prompt = buildSessionHtmlGenerationPrompt({
      session,
      conversation: [assistantItem],
      sourceItem: assistantItem,
      currentLivingHtml:
        '<!doctype html><html><body>Existing page</body></html>',
    })

    expect(prompt).toContain('Preserve and improve the existing living page')
    expect(prompt).toContain('Existing page')
  })

  it('unwraps fenced generated HTML', () => {
    expect(
      normalizeGeneratedHtml(
        '```html\n<!doctype html><html><body>ok</body></html>\n```',
      ),
    ).toBe('<!doctype html><html><body>ok</body></html>')
  })

  it('wraps an HTML fragment in a full document', () => {
    expect(normalizeGeneratedHtml('<main>ok</main>')).toContain(
      '<!doctype html>',
    )
  })

  it('escapes plain text fallback output', () => {
    const html = normalizeGeneratedHtml('plain <unsafe> text')

    expect(html).toContain('&lt;unsafe&gt;')
    expect(html).toContain('<pre>')
  })
})
