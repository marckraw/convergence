import { describe, expect, it } from 'vitest'
import {
  buildCursorAcpAskQuestionInputRequest,
  buildCursorAcpAskQuestionResponse,
  buildCursorAcpCreatePlanInputRequest,
  buildCursorAcpCreatePlanResponse,
  buildCursorAcpPassiveUpdateAcknowledgement,
  buildCursorAcpPassiveUpdateNote,
  buildCursorAcpPermissionRequest,
  buildCursorAcpPrompt,
  buildCursorAcpToolView,
  readCursorAcpContentText,
  shouldAutoApproveCursorPermissions,
} from './cursor-acp-message.pure'

describe('cursor ACP message helpers', () => {
  it('builds ACP prompt content from text, image, and text attachments', () => {
    const prompt = buildCursorAcpPrompt({
      text: 'Review this',
      parts: [
        {
          kind: 'image',
          mimeType: 'image/png',
          filename: 'screen.png',
          storagePath: '/tmp/screen.png',
          bytes: new Uint8Array([1, 2, 3]),
        },
        {
          kind: 'text',
          mimeType: 'text/plain',
          filename: 'notes.txt',
          storagePath: '/tmp/notes.txt',
          bytes: new TextEncoder().encode('hello'),
        },
      ],
    })

    expect(prompt).toEqual([
      {
        type: 'image',
        mimeType: 'image/png',
        data: 'AQID',
      },
      {
        type: 'text',
        text: '<file path="notes.txt">\nhello\n</file>\n\nReview this',
      },
    ])
  })

  it('rejects PDF attachments for Cursor ACP', () => {
    expect(() =>
      buildCursorAcpPrompt({
        text: 'Review',
        parts: [
          {
            kind: 'pdf',
            mimeType: 'application/pdf',
            filename: 'a.pdf',
            storagePath: '/tmp/a.pdf',
            bytes: new Uint8Array([1]),
          },
        ],
      }),
    ).toThrow('Cursor ACP does not support PDF attachments')
  })

  it('extracts text from nested ACP content wrappers', () => {
    expect(
      readCursorAcpContentText([
        {
          type: 'content',
          content: { type: 'text', text: 'one' },
        },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('one\ntwo')
  })

  it('maps Cursor tool calls and updates into transcript-ready views', () => {
    expect(
      buildCursorAcpToolView({
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          title: 'Read package.json',
          kind: 'read',
          status: 'pending',
          rawInput: { path: 'package.json' },
        },
      }),
    ).toMatchObject({
      toolCallId: 'tool-1',
      title: 'Read package.json',
      kind: 'read',
      status: 'pending',
      inputText:
        'Kind: read\n\nStatus: pending\n\nInput:\n{\n  "path": "package.json"\n}',
      state: 'complete',
    })

    expect(
      buildCursorAcpToolView({
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'completed',
          content: [
            {
              type: 'content',
              content: { type: 'text', text: 'Done' },
            },
          ],
        },
      }),
    ).toMatchObject({
      toolCallId: 'tool-1',
      status: 'completed',
      outputText: 'Done',
      state: 'complete',
    })

    expect(
      buildCursorAcpToolView({
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'cancelled',
        },
      }),
    ).toMatchObject({
      toolCallId: 'tool-1',
      status: 'cancelled',
      outputText: 'Status: cancelled',
      state: 'error',
    })
  })

  it('builds permission responses using the conservative P0 option mapping', () => {
    const request = buildCursorAcpPermissionRequest({
      toolCall: {
        toolCallId: 'tool-1',
        title: 'Run tests',
        kind: 'execute',
        rawInput: { command: 'npm test' },
      },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    })

    expect(request.description).toContain('Cursor requests permission')
    expect(request.description).toContain('Run tests')
    expect(request.approveResult).toEqual({
      outcome: { outcome: 'selected', optionId: 'allow-once' },
    })
    expect(request.denyResult).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject-once' },
    })
    expect(request.cancelResult).toEqual({
      outcome: { outcome: 'cancelled' },
    })
  })

  it('maps Cursor ask-question requests to choice interactions and provider option ids', () => {
    const request = buildCursorAcpAskQuestionInputRequest({
      toolCallId: 'call-1',
      title: 'Need input',
      questions: [
        {
          id: 'mode',
          prompt: 'Which mode should I use?',
          options: [
            { id: 'agent', label: 'Agent' },
            { id: 'plan', label: 'Plan' },
          ],
        },
      ],
    })

    expect(request).toMatchObject({
      prompt: 'Need input\n\nWhich mode should I use?',
      request: {
        kind: 'choice',
        questions: [
          {
            id: 'mode',
            question: 'Which mode should I use?',
            multiSelect: false,
            options: [{ label: 'Agent' }, { label: 'Plan' }],
          },
        ],
      },
      pending: {
        kind: 'ask-question',
        toolCallId: 'call-1',
      },
    })

    const pending = request?.pending
    if (!pending || pending.kind !== 'ask-question') {
      throw new Error('Expected ask-question pending request')
    }

    expect(
      buildCursorAcpAskQuestionResponse(
        pending,
        {
          kind: 'choice',
          answers: [{ questionId: 'mode', values: ['Plan'] }],
        },
        '',
      ),
    ).toEqual({
      outcome: {
        outcome: 'answered',
        answers: [
          {
            questionId: 'mode',
            selectedOptionIds: ['plan'],
          },
        ],
      },
    })
  })

  it('skips Cursor ask-question responses when no option can be matched', () => {
    const request = buildCursorAcpAskQuestionInputRequest({
      questions: [
        {
          id: 'mode',
          prompt: 'Which mode?',
          options: [{ id: 'agent', label: 'Agent' }],
        },
      ],
    })

    const pending = request?.pending
    if (!pending || pending.kind !== 'ask-question') {
      throw new Error('Expected ask-question pending request')
    }

    expect(
      buildCursorAcpAskQuestionResponse(pending, undefined, 'something else'),
    ).toEqual({
      outcome: {
        outcome: 'skipped',
        reason: 'something else',
      },
    })
  })

  it('maps Cursor create-plan requests to shared plan interactions', () => {
    const request = buildCursorAcpCreatePlanInputRequest({
      toolCallId: 'call-2',
      name: 'Refactor layout',
      overview: 'Tighten layout behavior.',
      plan: '1. Inspect current layout.\n2. Update sizing.',
      todos: [
        {
          id: 'todo-1',
          content: 'Inspect current layout',
          status: 'completed',
        },
        {
          id: 'todo-2',
          content: 'Update sizing',
          status: 'in_progress',
        },
      ],
    })

    expect(request).toMatchObject({
      prompt: 'Cursor requests plan approval: Refactor layout',
      request: {
        kind: 'plan',
      },
      pending: {
        kind: 'create-plan',
        toolCallId: 'call-2',
      },
    })
    expect(request?.request.kind === 'plan' ? request.request.plan : '').toBe(
      'Tighten layout behavior.\n\n1. Inspect current layout.\n2. Update sizing.\n\nTodos:\n[completed] Inspect current layout\n[in_progress] Update sizing',
    )

    const pending = request?.pending
    if (!pending || pending.kind !== 'create-plan') {
      throw new Error('Expected create-plan pending request')
    }

    expect(
      buildCursorAcpCreatePlanResponse(
        pending,
        { kind: 'plan', decision: 'approve' },
        '',
      ),
    ).toEqual({
      outcome: { outcome: 'accepted' },
    })
    expect(
      buildCursorAcpCreatePlanResponse(
        pending,
        { kind: 'plan', decision: 'reject', message: 'Need a smaller slice' },
        '',
      ),
    ).toEqual({
      outcome: {
        outcome: 'rejected',
        reason: 'Need a smaller slice',
      },
    })
  })

  it('maps Cursor passive update notifications to provider-neutral notes', () => {
    expect(
      buildCursorAcpPassiveUpdateNote('cursor/update_todos', {
        toolCallId: 'call-3',
        merge: true,
        todos: [
          {
            id: 'todo-1',
            content: 'Wire interaction answer path',
            status: 'in_progress',
          },
        ],
      }),
    ).toEqual({
      text: 'Cursor todos updated\n\nMerge: yes\n\nTodos:\n[in_progress] Wire interaction answer path',
      level: 'info',
      providerItemId: 'call-3',
    })

    expect(
      buildCursorAcpPassiveUpdateNote('cursor/generate_image', {
        toolCallId: 'call-4',
        description: 'App icon',
        filePath: '/tmp/icon.png',
      }),
    ).toEqual({
      text: 'Cursor generated image payload received, but Convergence cannot render it as a shared artifact yet.\n\nApp icon\n\nFile: /tmp/icon.png',
      level: 'warning',
      providerItemId: 'call-4',
    })

    expect(
      buildCursorAcpPassiveUpdateAcknowledgement('cursor/update_todos', {
        todos: [{ id: 'todo-1', content: 'Done', status: 'completed' }],
      }),
    ).toEqual({
      outcome: {
        outcome: 'accepted',
        todos: [{ id: 'todo-1', content: 'Done', status: 'completed' }],
      },
    })
  })

  it('auto-approves Cursor permissions only for the yolo preset', () => {
    expect(shouldAutoApproveCursorPermissions({ preset: 'yolo' })).toBe(true)
    expect(shouldAutoApproveCursorPermissions({ preset: 'ask' })).toBe(false)
  })
})
