import type {
  InteractionRequest,
  InteractionResponse,
} from '../../session/conversation-item.types'
import type { PiExtensionUiRequest } from './pi-rpc'

export type PiExtensionUiDialogMethod =
  | 'select'
  | 'confirm'
  | 'input'
  | 'editor'

export interface PendingPiExtensionUiRequest {
  id: string
  method: PiExtensionUiDialogMethod
}

export interface PiExtensionUiInputRequest {
  prompt: string
  request: InteractionRequest
  pending: PendingPiExtensionUiRequest
}

export function isPiExtensionUiDialogMethod(
  method: string,
): method is PiExtensionUiDialogMethod {
  return (
    method === 'select' ||
    method === 'confirm' ||
    method === 'input' ||
    method === 'editor'
  )
}

export function isPiExtensionUiFireAndForgetMethod(method: string): boolean {
  return (
    method === 'notify' ||
    method === 'setStatus' ||
    method === 'setWidget' ||
    method === 'setTitle' ||
    method === 'set_editor_text'
  )
}

export function buildPiExtensionUiInputRequest(
  source: PiExtensionUiRequest,
): PiExtensionUiInputRequest | null {
  if (!isPiExtensionUiDialogMethod(source.method)) return null

  const title = readString(source.title) ?? defaultTitle(source.method)
  const message = readString(source.message)
  const pending: PendingPiExtensionUiRequest = {
    id: source.id,
    method: source.method,
  }

  if (source.method === 'select') {
    const options = readStringArray(source.options)
    if (options.length === 0) return null

    return {
      prompt: title,
      pending,
      request: {
        kind: 'choice',
        questions: [
          {
            id: 'value',
            header: 'Select',
            question: title,
            multiSelect: false,
            options: options.map((option) => ({ label: option })),
          },
        ],
      },
    }
  }

  if (source.method === 'confirm') {
    return {
      prompt: message ? `${title}\n\n${message}` : title,
      pending,
      request: {
        kind: 'choice',
        questions: [
          {
            id: 'confirmed',
            header: 'Confirm',
            question: message ?? title,
            multiSelect: false,
            options: [{ label: 'Confirm' }, { label: 'Cancel' }],
          },
        ],
      },
    }
  }

  if (source.method === 'input') {
    const placeholder = readString(source.placeholder)
    return {
      prompt: title,
      pending,
      request: {
        kind: 'form',
        title,
        message: placeholder ? `Placeholder: ${placeholder}` : '',
        fields: [
          {
            id: 'value',
            label: title,
            description: placeholder,
            type: 'string',
            required: false,
          },
        ],
      },
    }
  }

  const prefill = readString(source.prefill)
  return {
    prompt: title,
    pending,
    request: {
      kind: 'form',
      title,
      message: message ?? '',
      fields: [
        {
          id: 'value',
          label: title,
          type: 'string',
          required: false,
          defaultValue: prefill,
          multiline: true,
        },
      ],
    },
  }
}

export function buildPiExtensionUiResponse(
  pending: PendingPiExtensionUiRequest,
  response: InteractionResponse | undefined,
  fallbackText: string,
): Record<string, unknown> {
  if (pending.method === 'confirm') {
    if (response?.kind === 'choice') {
      const value = response.answers.find(
        (answer) => answer.questionId === 'confirmed',
      )?.values[0]
      return { confirmed: value === 'Confirm' }
    }

    return { confirmed: isAffirmativeText(fallbackText) }
  }

  if (pending.method === 'select') {
    if (response?.kind === 'choice') {
      const value = response.answers.find(
        (answer) => answer.questionId === 'value',
      )?.values[0]
      return value ? { value } : { cancelled: true }
    }

    return fallbackText.trim()
      ? { value: fallbackText.trim() }
      : { cancelled: true }
  }

  if (response?.kind === 'form') {
    if (response.action === 'decline') {
      return { cancelled: true }
    }

    return {
      value: String(response.values.value ?? ''),
    }
  }

  return fallbackText ? { value: fallbackText } : { cancelled: true }
}

export function buildPiFireAndForgetNote(
  request: PiExtensionUiRequest,
): { text: string; level: 'info' | 'warning' | 'error' } | null {
  if (request.method !== 'notify') return null

  const message = readString(request.message)
  if (!message) return null

  const notifyType = readString(request.notifyType)
  const level =
    notifyType === 'error'
      ? 'error'
      : notifyType === 'warning'
        ? 'warning'
        : 'info'
  return { text: message, level }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function defaultTitle(method: PiExtensionUiDialogMethod): string {
  switch (method) {
    case 'select':
      return 'Select an option'
    case 'confirm':
      return 'Confirm'
    case 'input':
      return 'Enter a value'
    case 'editor':
      return 'Edit value'
  }
}

function isAffirmativeText(value: string): boolean {
  return /^(y|yes|true|confirm|confirmed|approve|approved)$/i.test(value.trim())
}
