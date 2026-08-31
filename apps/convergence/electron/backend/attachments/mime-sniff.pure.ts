import type { AttachmentKind } from './attachments.types'

export interface SniffedMime {
  mimeType: string
  kind: AttachmentKind
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIG = [0xff, 0xd8, 0xff]
const GIF87_SIG = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF89_SIG = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const RIFF_SIG = [0x52, 0x49, 0x46, 0x46]
const WEBP_SIG = [0x57, 0x45, 0x42, 0x50]
const PDF_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d]

function matchesPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return false
  }
  return true
}

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  prefix: number[],
): boolean {
  if (bytes.length < offset + prefix.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[offset + i] !== prefix[i]) return false
  }
  return true
}

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    decoder.decode(bytes)
    return true
  } catch {
    return false
  }
}

export function sniffMime(bytes: Uint8Array): SniffedMime | null {
  if (matchesPrefix(bytes, PNG_SIG)) {
    return { mimeType: 'image/png', kind: 'image' }
  }
  if (matchesPrefix(bytes, JPEG_SIG)) {
    return { mimeType: 'image/jpeg', kind: 'image' }
  }
  if (matchesPrefix(bytes, GIF87_SIG) || matchesPrefix(bytes, GIF89_SIG)) {
    return { mimeType: 'image/gif', kind: 'image' }
  }
  if (matchesPrefix(bytes, RIFF_SIG) && matchesAt(bytes, 8, WEBP_SIG)) {
    return { mimeType: 'image/webp', kind: 'image' }
  }
  if (matchesPrefix(bytes, PDF_SIG)) {
    return { mimeType: 'application/pdf', kind: 'pdf' }
  }
  if (isValidUtf8(bytes)) {
    return { mimeType: 'text/plain', kind: 'text' }
  }
  return null
}

const TEXT_EXTENSION_MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  ts: 'text/x-typescript',
  tsx: 'text/x-typescript',
  js: 'text/javascript',
  jsx: 'text/javascript',
  py: 'text/x-python',
  rb: 'text/x-ruby',
  go: 'text/x-go',
  rs: 'text/x-rust',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c++',
  h: 'text/x-c',
  sh: 'application/x-sh',
  yml: 'text/yaml',
  yaml: 'text/yaml',
  toml: 'text/toml',
  xml: 'text/xml',
  html: 'text/html',
  css: 'text/css',
  sql: 'text/x-sql',
  log: 'text/plain',
}

export function mimeTypeForTextExtension(filename: string): string | null {
  const match = /\.([^./\\]+)$/.exec(filename.toLowerCase())
  if (!match) return null
  const ext = match[1]
  return TEXT_EXTENSION_MIME[ext] ?? null
}
