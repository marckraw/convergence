import type {
  Attachment,
  AttachmentKind,
} from '../../attachments/attachments.types'

export interface CodexMessagePart {
  kind: AttachmentKind
  mimeType: string
  filename: string
  storagePath: string
  bytes?: Uint8Array
}

export type CodexUserInput =
  | { type: 'text'; text: string; text_elements: [] }
  | { type: 'localImage'; path: string }

export interface CodexMessageInput {
  text: string
  parts?: CodexMessagePart[]
}

export function partFromAttachment(
  attachment: Attachment,
  bytes?: Uint8Array,
): CodexMessagePart {
  return {
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    filename: attachment.filename,
    storagePath: attachment.storagePath,
    bytes,
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

export function buildCodexUserInput(
  input: CodexMessageInput,
): CodexUserInput[] {
  const parts = input.parts ?? []

  const pdfs = parts.filter((p) => p.kind === 'pdf')
  if (pdfs.length > 0) {
    throw new Error('Codex does not support PDF attachments')
  }

  const images = parts.filter((p) => p.kind === 'image')
  const texts = parts.filter((p) => p.kind === 'text')

  const out: CodexUserInput[] = []

  for (const image of images) {
    out.push({ type: 'localImage', path: image.storagePath })
  }

  const inlinedTextBlocks = texts.map((p) => {
    const body = p.bytes ? decodeUtf8(p.bytes) : ''
    return `<file path="${p.filename}">\n${body}\n</file>`
  })

  const combinedText = [...inlinedTextBlocks, input.text]
    .filter((s) => s.length > 0)
    .join('\n\n')

  if (combinedText.length > 0 || out.length === 0) {
    out.push({ type: 'text', text: combinedText, text_elements: [] })
  }

  return out
}
