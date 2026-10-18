import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import { referencedAttachmentIdsKey } from './referenced-attachments.pure'

function message(
  id: string,
  attachmentIds?: string[],
  text = 'hello',
): ConversationItem {
  return {
    id,
    sessionId: 's1',
    sequence: 1,
    turnId: null,
    kind: 'message',
    state: 'complete',
    actor: 'user',
    text,
    attachmentIds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
  } as ConversationItem
}

function toolResult(
  id: string,
  attachmentIds?: string[],
  outputText = 'took a screenshot',
): ConversationItem {
  return {
    id,
    sessionId: 's1',
    sequence: 2,
    turnId: 't1',
    kind: 'tool-result',
    state: 'complete',
    toolName: 'screenshot',
    relatedItemId: null,
    outputText,
    attachmentIds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
  }
}

describe('referencedAttachmentIdsKey', () => {
  it('is empty for a transcript without attachments', () => {
    expect(referencedAttachmentIdsKey([])).toBe('')
    expect(referencedAttachmentIdsKey([message('m1')])).toBe('')
  })

  it('changes when a message with a new attachment lands', () => {
    const before = [message('m1', ['a1'])]
    const after = [...before, message('m2', ['a2', 'a3'])]
    expect(referencedAttachmentIdsKey(before)).not.toBe(
      referencedAttachmentIdsKey(after),
    )
  })

  it('stays equal while text streams into a message', () => {
    const first = [message('m1', ['a1'], 'hel')]
    const second = [message('m1', ['a1'], 'hello world')]
    expect(referencedAttachmentIdsKey(first)).toBe(
      referencedAttachmentIdsKey(second),
    )
  })

  it('counts the images a tool result produced (MAR-4274)', () => {
    expect(referencedAttachmentIdsKey([toolResult('r1', ['img-1'])])).toBe(
      'img-1',
    )
    expect(
      referencedAttachmentIdsKey([
        message('m1', ['a1']),
        toolResult('r1', ['img-1', 'img-2']),
      ]),
    ).toBe('a1\nimg-1\nimg-2')
  })

  it('changes when a tool result gains its images after it landed', () => {
    const before = [toolResult('r1')]
    const after = [toolResult('r1', ['img-1'])]
    expect(referencedAttachmentIdsKey(before)).toBe('')
    expect(referencedAttachmentIdsKey(before)).not.toBe(
      referencedAttachmentIdsKey(after),
    )
  })

  it('stays equal while a tool result streams its output', () => {
    expect(referencedAttachmentIdsKey([toolResult('r1', ['img-1'], 'a')])).toBe(
      referencedAttachmentIdsKey([toolResult('r1', ['img-1'], 'a longer one')]),
    )
  })
})
