import type { AttachmentKind } from '../../attachments/attachments.types'

export interface PiMessagePart {
  kind: AttachmentKind
  mimeType: string
  filename: string
  storagePath: string
  bytes?: Uint8Array
}

export interface PiImage {
  type: 'image'
  data: string
  mimeType: string
}

export interface PiPromptPayload {
  message: string
  images?: PiImage[]
}

export interface PiMessageInput {
  text: string
  parts?: PiMessagePart[]
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  )
}

function buildAttachmentPathBridge(parts: PiMessagePart[]): string | null {
  if (parts.length === 0) return null

  const rows = parts.map(
    (part, index) =>
      `${index + 1}. ${part.kind}: ${part.filename} (${part.mimeType})\n   path: ${part.storagePath}`,
  )

  return [
    '<attached-files>',
    'These files were attached by the user and are available on the local filesystem. If native attachment content is unavailable or insufficient, use the read tool with the path below to inspect the file.',
    ...rows,
    '</attached-files>',
  ].join('\n')
}

export function buildPiPromptPayload(input: PiMessageInput): PiPromptPayload {
  const parts = input.parts ?? []

  const pdfs = parts.filter((p) => p.kind === 'pdf')
  if (pdfs.length > 0) {
    throw new Error('Pi does not support PDF attachments')
  }

  const images = parts.filter((p) => p.kind === 'image')
  const texts = parts.filter((p) => p.kind === 'text')

  const inlinedTextBlocks = texts.map((p) => {
    const body = p.bytes ? decodeUtf8(p.bytes) : ''
    return `<file path="${p.filename}">\n${body}\n</file>`
  })

  const attachmentPathBridge = buildAttachmentPathBridge(parts)

  const message = [...inlinedTextBlocks, attachmentPathBridge, input.text]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join('\n\n')

  const payload: PiPromptPayload = { message }

  if (images.length > 0) {
    payload.images = images.map((p) => {
      if (!p.bytes) {
        throw new Error(`Pi image attachment missing bytes: ${p.filename}`)
      }
      return {
        type: 'image',
        data: encodeBase64(p.bytes),
        mimeType: p.mimeType,
      }
    })
  }

  return payload
}
