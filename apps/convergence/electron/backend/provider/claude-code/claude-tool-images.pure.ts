import {
  EXTENSION_BY_MIME,
  MAX_TOOL_IMAGE_BYTES,
  MAX_TOOL_IMAGES_PER_RESULT,
} from '../../attachments/attachments.constants'
import type {
  ToolAttachmentOmissionCode,
  ToolAttachmentOmissions,
  ToolImageBytes,
} from '../../session/conversation-item.types'

/** The images a Claude tool result carried, and the ones left out by reason. */
export interface ClaudeToolImages {
  images: ToolImageBytes[]
  omissions: ToolAttachmentOmissions
}

const TOOL_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

// A flat character class, not a group per quantum: a grouped repetition
// recurses per match in V8 and overflows the stack on a megabytes-long image.
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function isBase64(data: string): boolean {
  return data.length > 0 && data.length % 4 === 0 && BASE64_PATTERN.test(data)
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

/** The bytes a base64 string decodes to, read off its length alone. */
function decodedByteLength(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

/**
 * Reads the images out of a `tool_result` block's `content` (MAR-4274).
 * Claude sends them as `{ type: 'image', source: { type: 'base64', ... } }`
 * beside the text blocks, which the provider reads on its own. An image is
 * sized from its base64 length before it is decoded, so one too large, or one
 * past the per-result limit, never costs its bytes; the attachment store
 * checks what is kept once more.
 */
export function readClaudeToolResultImages(content: unknown): ClaudeToolImages {
  const images: ToolImageBytes[] = []
  const omissions: ToolAttachmentOmissions = {}
  const omit = (code: ToolAttachmentOmissionCode) => {
    omissions[code] = (omissions[code] ?? 0) + 1
  }
  if (!Array.isArray(content)) return { images, omissions }

  for (const entry of content) {
    const block = record(entry)
    if (block?.type !== 'image') continue
    const source = record(block.source)
    const mimeType =
      typeof source?.media_type === 'string'
        ? source.media_type.trim().toLowerCase()
        : ''
    if (source?.type !== 'base64' || !TOOL_IMAGE_MIME_TYPES.has(mimeType)) {
      omit('unsupported-mime-type')
      continue
    }
    const data = typeof source.data === 'string' ? source.data : ''
    if (decodedByteLength(data) > MAX_TOOL_IMAGE_BYTES) {
      omit('image-too-large')
      continue
    }
    if (!isBase64(data)) {
      omit('invalid-image')
      continue
    }
    if (images.length >= MAX_TOOL_IMAGES_PER_RESULT) {
      omit('turn-limit')
      continue
    }
    // A copy, not the Buffer: a small Buffer is a view into Node's shared
    // pool, and the delta should carry only this image's bytes.
    const bytes = new Uint8Array(Buffer.from(data, 'base64'))
    if (bytes.byteLength === 0) {
      omit('invalid-image')
      continue
    }
    images.push({
      name: `tool-image-${images.length + 1}${EXTENSION_BY_MIME[mimeType]}`,
      mimeType,
      bytes,
    })
  }
  return { images, omissions }
}

/** Whether a read found anything the session should hear about. */
export function hasClaudeToolImages(read: ClaudeToolImages): boolean {
  return read.images.length > 0 || Object.keys(read.omissions).length > 0
}
