import type { AttachmentKind } from '../../attachments/attachments.types'

export interface ClaudeMessagePart {
  kind: AttachmentKind
  mimeType: string
  filename: string
  bytes: Uint8Array
}

export interface ClaudeUserMessageInput {
  text: string
  parts?: ClaudeMessagePart[]
}

type ClaudeContentBlock =
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }
  | {
      type: 'document'
      source: { type: 'base64'; media_type: string; data: string }
    }
  | { type: 'text'; text: string }

export interface ClaudeUserMessage {
  type: 'user'
  message: {
    role: 'user'
    content: ClaudeContentBlock[]
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  )
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function buildInlinedTextBlock(
  textParts: ClaudeMessagePart[],
  userText: string,
): string {
  const blocks = textParts.map(
    (p) => `<file path="${p.filename}">\n${decodeUtf8(p.bytes)}\n</file>`,
  )
  if (userText.length > 0) {
    blocks.push(userText)
  }
  return blocks.join('\n\n')
}

export function buildClaudeUserMessage(
  input: ClaudeUserMessageInput,
): ClaudeUserMessage {
  const parts = input.parts ?? []
  const images = parts.filter((p) => p.kind === 'image')
  const pdfs = parts.filter((p) => p.kind === 'pdf')
  const texts = parts.filter((p) => p.kind === 'text')

  const content: ClaudeContentBlock[] = []

  for (const part of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mimeType,
        data: toBase64(part.bytes),
      },
    })
  }

  for (const part of pdfs) {
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: part.mimeType,
        data: toBase64(part.bytes),
      },
    })
  }

  const combinedText = buildInlinedTextBlock(texts, input.text)
  if (combinedText.length > 0 || content.length === 0) {
    content.push({ type: 'text', text: combinedText })
  }

  return {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
  }
}

export function buildClaudeUserMessageLine(
  input: ClaudeUserMessageInput,
): string {
  return JSON.stringify(buildClaudeUserMessage(input))
}
