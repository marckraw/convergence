import { describe, expect, it } from 'vitest'
import {
  buildPiExtensionUiInputRequest,
  buildPiExtensionUiResponse,
  buildPiFireAndForgetNote,
} from './pi-extension-ui.pure'
import type { PiExtensionUiRequest } from './pi-rpc'

describe('pi extension UI mapping', () => {
  it('maps select requests to choice interaction requests and value responses', () => {
    const inputRequest = buildPiExtensionUiInputRequest({
      type: 'extension_ui_request',
      id: 'select-1',
      method: 'select',
      title: 'Pick provider',
      options: ['Claude', 'Codex'],
    })

    expect(inputRequest?.request).toMatchObject({
      kind: 'choice',
      questions: [
        {
          id: 'value',
          question: 'Pick provider',
          options: [{ label: 'Claude' }, { label: 'Codex' }],
        },
      ],
    })

    expect(
      buildPiExtensionUiResponse(
        { id: 'select-1', method: 'select' },
        {
          kind: 'choice',
          answers: [{ questionId: 'value', values: ['Codex'] }],
        },
        '',
      ),
    ).toEqual({ value: 'Codex' })
  })

  it('maps confirm requests to confirmation choices and confirmed responses', () => {
    const inputRequest = buildPiExtensionUiInputRequest({
      type: 'extension_ui_request',
      id: 'confirm-1',
      method: 'confirm',
      title: 'Clear session?',
      message: 'All messages will be lost.',
    })

    expect(inputRequest?.prompt).toBe(
      'Clear session?\n\nAll messages will be lost.',
    )
    expect(inputRequest?.request).toMatchObject({
      kind: 'choice',
      questions: [
        {
          id: 'confirmed',
          options: [{ label: 'Confirm' }, { label: 'Cancel' }],
        },
      ],
    })

    expect(
      buildPiExtensionUiResponse(
        { id: 'confirm-1', method: 'confirm' },
        {
          kind: 'choice',
          answers: [{ questionId: 'confirmed', values: ['Cancel'] }],
        },
        '',
      ),
    ).toEqual({ confirmed: false })
  })

  it('maps input and editor requests to form interactions', () => {
    const inputRequest = buildPiExtensionUiInputRequest({
      type: 'extension_ui_request',
      id: 'input-1',
      method: 'input',
      title: 'Enter a value',
      placeholder: 'Type here',
    })
    const editorRequest = buildPiExtensionUiInputRequest({
      type: 'extension_ui_request',
      id: 'editor-1',
      method: 'editor',
      title: 'Edit text',
      prefill: 'Line 1\nLine 2',
    })

    expect(inputRequest?.request).toMatchObject({
      kind: 'form',
      fields: [{ id: 'value', type: 'string', description: 'Type here' }],
    })
    expect(editorRequest?.request).toMatchObject({
      kind: 'form',
      fields: [
        { id: 'value', multiline: true, defaultValue: 'Line 1\nLine 2' },
      ],
    })
    expect(
      buildPiExtensionUiResponse(
        { id: 'editor-1', method: 'editor' },
        {
          kind: 'form',
          action: 'accept',
          values: { value: 'Edited text' },
        },
        '',
      ),
    ).toEqual({ value: 'Edited text' })
  })

  it('returns cancellation for declined text dialogs', () => {
    expect(
      buildPiExtensionUiResponse(
        { id: 'input-1', method: 'input' },
        {
          kind: 'form',
          action: 'decline',
          values: {},
        },
        '',
      ),
    ).toEqual({ cancelled: true })
  })

  it('maps notify requests to non-blocking notes', () => {
    const request: PiExtensionUiRequest = {
      type: 'extension_ui_request',
      id: 'notify-1',
      method: 'notify',
      message: 'Command blocked',
      notifyType: 'warning',
    }

    expect(buildPiFireAndForgetNote(request)).toEqual({
      text: 'Command blocked',
      level: 'warning',
    })
  })
})
