import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import {
  buildConversationRenderPlan,
  findActionableApprovalIds,
} from './session-transcript-render-plan.pure'

const base = {
  sessionId: 'session-1',
  state: 'complete' as const,
  createdAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
  providerMeta: {
    providerId: 'claude-code',
    providerItemId: null,
    providerEventType: null,
  },
}

function bootContextNote(sequence: number, text: string): ConversationItem {
  return {
    ...base,
    id: `note-${sequence}`,
    sequence,
    turnId: null,
    kind: 'note',
    level: 'info',
    text,
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'context.boot',
    },
  }
}

function userMessage(sequence: number, text: string): ConversationItem {
  return {
    ...base,
    id: `user-${sequence}`,
    sequence,
    turnId: `turn-${sequence}`,
    kind: 'message',
    actor: 'user',
    text,
  }
}

function approvalRequest(sequence: number): ConversationItem {
  return {
    ...base,
    id: `approval-${sequence}`,
    sequence,
    turnId: `turn-${sequence}`,
    kind: 'approval-request',
    description: `Approval ${sequence}`,
  }
}

describe('buildConversationRenderPlan', () => {
  it('hides boot context notes and attaches their text to the next user message', () => {
    const note = bootContextNote(
      1,
      '<project:context>\npath\n</project:context>',
    )
    const message = userMessage(2, 'do you know the path?')

    expect(buildConversationRenderPlan([note, message])).toEqual([
      {
        item: message,
        injectedContextText: '<project:context>\npath\n</project:context>',
        turnBoundary: true,
        turnSequence: 1,
      },
    ])
  })

  it('keeps non-context notes as normal transcript entries', () => {
    const note: ConversationItem = {
      ...base,
      id: 'note-normal',
      sequence: 1,
      turnId: null,
      kind: 'note',
      level: 'info',
      text: 'Session resumed',
    }
    const message = userMessage(2, 'continue')

    expect(buildConversationRenderPlan([note, message])).toEqual([
      {
        item: note,
        injectedContextText: null,
        turnBoundary: false,
        turnSequence: null,
      },
      {
        item: message,
        injectedContextText: null,
        turnBoundary: true,
        turnSequence: 1,
      },
    ])
  })

  it('renders orphaned boot context notes rather than dropping them', () => {
    const note = bootContextNote(1, '<project:context />')

    expect(buildConversationRenderPlan([note])).toEqual([
      {
        item: note,
        injectedContextText: null,
        turnBoundary: false,
        turnSequence: null,
      },
    ])
  })

  it('computes turn boundaries and sequence numbers in render-plan order', () => {
    const firstUser = userMessage(1, 'start')
    const assistant: ConversationItem = {
      ...base,
      id: 'assistant-2',
      sequence: 2,
      turnId: firstUser.turnId,
      kind: 'message',
      actor: 'assistant',
      text: 'ok',
    }
    const secondUser = userMessage(3, 'continue')

    expect(
      buildConversationRenderPlan([firstUser, assistant, secondUser]).map(
        (entry) => ({
          id: entry.item.id,
          turnBoundary: entry.turnBoundary,
          turnSequence: entry.turnSequence,
        }),
      ),
    ).toEqual([
      { id: firstUser.id, turnBoundary: true, turnSequence: 1 },
      { id: assistant.id, turnBoundary: false, turnSequence: null },
      { id: secondUser.id, turnBoundary: true, turnSequence: 2 },
    ])
  })

  it('marks the final approval block as actionable and ignores trailing notes', () => {
    const first = approvalRequest(1)
    const second = approvalRequest(2)
    const note: ConversationItem = {
      ...base,
      id: 'note-3',
      sequence: 3,
      turnId: second.turnId,
      kind: 'note',
      level: 'warning',
      text: 'Still waiting',
    }

    expect(
      findActionableApprovalIds(
        buildConversationRenderPlan([first, second, note]),
      ),
    ).toEqual([first.id, second.id])
  })

  it('does not mark historical approvals before later work as actionable', () => {
    const stale = approvalRequest(1)
    const result: ConversationItem = {
      ...base,
      id: 'result-2',
      sequence: 2,
      turnId: stale.turnId,
      kind: 'tool-result',
      toolName: 'shell',
      relatedItemId: null,
      outputText: 'done',
    }
    const current = approvalRequest(3)

    expect(
      findActionableApprovalIds(
        buildConversationRenderPlan([stale, result, current]),
      ),
    ).toEqual([current.id])
  })
})
