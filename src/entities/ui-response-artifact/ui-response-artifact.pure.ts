import type {
  ParsedAssistantResponse,
  ParsedUiResponseArtifact,
  UiResponseArtifact,
} from './ui-response-artifact.types'

const ARTIFACT_FENCE_LANGUAGE = 'convergence-ui-html'
const DEFAULT_ARTIFACT_TITLE = 'UI response'
const CSP_CONTENT = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ')

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export type UiResponseHtmlValidation =
  | { status: 'valid' }
  | { status: 'empty'; message: string }
  | { status: 'malformed'; message: string }

interface FenceMatch {
  start: number
  end: number
  content: string
}

interface ArtifactMetadata {
  title: string
}

export function parseAssistantUiResponse(
  text: string,
): ParsedAssistantResponse {
  const fence = findArtifactFence(text)
  if (!fence) {
    return { markdown: text, artifact: null }
  }

  const artifact = parseArtifactContent(fence.content)
  const markdown = removeRange(text, fence.start, fence.end)

  return {
    markdown: normalizeMarkdownAfterArtifactRemoval(markdown),
    artifact,
  }
}

export function artifactFromConversationItem(input: {
  sessionId: string
  conversationItemId: string
  text: string
  createdAt: string
}): UiResponseArtifact | null {
  const parsed = parseAssistantUiResponse(input.text)
  if (!parsed.artifact) return null

  return {
    id: `${input.conversationItemId}:ui-response`,
    sessionId: input.sessionId,
    conversationItemId: input.conversationItemId,
    title: parsed.artifact.title,
    kind: 'html',
    html: parsed.artifact.html,
    createdAt: input.createdAt,
  }
}

export function buildUiResponseSrcDoc(html: string): string {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(CSP_CONTENT)}">`
  const trimmed = html.trim()

  if (/<head\b[^>]*>/i.test(trimmed)) {
    return trimmed.replace(/<head\b([^>]*)>/i, `<head$1>${cspMeta}`)
  }

  if (/<html\b[^>]*>/i.test(trimmed)) {
    return trimmed.replace(
      /<html\b([^>]*)>/i,
      `<html$1><head>${cspMeta}</head>`,
    )
  }

  return `<!doctype html><html><head>${cspMeta}</head><body>${trimmed}</body></html>`
}

export function validateUiResponseHtml(html: string): UiResponseHtmlValidation {
  const trimmed = html.trim()
  if (!trimmed) {
    return {
      status: 'empty',
      message: 'The UI response artifact did not include any HTML.',
    }
  }

  if (/<[^>]*$/.test(trimmed)) {
    return {
      status: 'malformed',
      message: 'The UI response artifact contains an unterminated HTML tag.',
    }
  }

  const stack: string[] = []
  const tagPattern =
    /<!--[\s\S]*?-->|<!doctype\b[^>]*>|<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*)?>/gi
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(trimmed))) {
    const rawTag = match[0]
    const tagName = match[1]?.toLowerCase()
    if (!tagName || VOID_HTML_TAGS.has(tagName) || rawTag.endsWith('/>')) {
      continue
    }

    if (rawTag.startsWith('</')) {
      const openTag = stack.pop()
      if (openTag !== tagName) {
        return {
          status: 'malformed',
          message: `The UI response artifact closes </${tagName}> before closing <${openTag ?? 'unknown'}>.`,
        }
      }
      continue
    }

    stack.push(tagName)
  }

  if (stack.length > 0) {
    const openTag = stack[stack.length - 1]
    return {
      status: 'malformed',
      message: `The UI response artifact is missing a closing </${openTag}> tag.`,
    }
  }

  return { status: 'valid' }
}

function findArtifactFence(text: string): FenceMatch | null {
  let cursor = 0

  while (cursor < text.length) {
    const lineStart = cursor
    const lineEnd = findLineEnd(text, lineStart)
    const line = text.slice(lineStart, lineEnd)
    const opening = parseFenceOpening(line)

    if (!opening) {
      cursor = nextLineStart(text, lineEnd)
      continue
    }

    const contentStart = nextLineStart(text, lineEnd)
    let closeCursor = contentStart

    while (closeCursor < text.length) {
      const closeLineEnd = findLineEnd(text, closeCursor)
      const closeLine = text.slice(closeCursor, closeLineEnd)

      if (isClosingFence(closeLine, opening.marker)) {
        return {
          start: lineStart,
          end: nextLineStart(text, closeLineEnd),
          content: text.slice(contentStart, closeCursor),
        }
      }

      closeCursor = nextLineStart(text, closeLineEnd)
    }

    return null
  }

  return null
}

function parseFenceOpening(line: string): { marker: string } | null {
  const match = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(line)
  if (!match) return null

  const marker = match[2] ?? ''
  const info = (match[3] ?? '').trim().split(/\s+/)[0] ?? ''
  if (info !== ARTIFACT_FENCE_LANGUAGE) return null

  return { marker }
}

function isClosingFence(line: string, openingMarker: string): boolean {
  const markerChar = openingMarker[0]
  const minLength = openingMarker.length
  const escapedMarker = markerChar === '`' ? '`' : '~'
  const pattern = new RegExp(`^ {0,3}${escapedMarker}{${minLength},}\\s*$`)
  return pattern.test(line)
}

function parseArtifactContent(content: string): ParsedUiResponseArtifact {
  const normalized = stripBoundaryBlankLines(content)

  if (!normalized.startsWith('---')) {
    return {
      title: DEFAULT_ARTIFACT_TITLE,
      html: normalized,
    }
  }

  const firstLineEnd = findLineEnd(normalized, 0)
  const firstLine = normalized.slice(0, firstLineEnd).trim()
  if (firstLine !== '---') {
    return {
      title: DEFAULT_ARTIFACT_TITLE,
      html: normalized,
    }
  }

  const metadataStart = nextLineStart(normalized, firstLineEnd)
  let cursor = metadataStart

  while (cursor < normalized.length) {
    const lineEnd = findLineEnd(normalized, cursor)
    const line = normalized.slice(cursor, lineEnd)

    if (line.trim() === '---') {
      const metadataText = normalized.slice(metadataStart, cursor)
      const html = stripBoundaryBlankLines(
        normalized.slice(nextLineStart(normalized, lineEnd)),
      )

      return {
        title: parseMetadata(metadataText).title,
        html,
      }
    }

    cursor = nextLineStart(normalized, lineEnd)
  }

  return {
    title: DEFAULT_ARTIFACT_TITLE,
    html: normalized,
  }
}

function parseMetadata(metadataText: string): ArtifactMetadata {
  const metadata: ArtifactMetadata = { title: DEFAULT_ARTIFACT_TITLE }

  for (const line of metadataText.split(/\r?\n/)) {
    const match = /^title:\s*(.*)$/.exec(line.trim())
    if (!match) continue

    const title = unquoteMetadataValue(match[1] ?? '').trim()
    if (title) {
      metadata.title = title
    }
  }

  return metadata
}

function unquoteMetadataValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function removeRange(text: string, start: number, end: number): string {
  return `${text.slice(0, start)}${text.slice(end)}`
}

function normalizeMarkdownAfterArtifactRemoval(markdown: string): string {
  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

function stripBoundaryBlankLines(value: string): string {
  return value.replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '')
}

function findLineEnd(text: string, start: number): number {
  const index = text.indexOf('\n', start)
  return index === -1 ? text.length : index
}

function nextLineStart(text: string, lineEnd: number): number {
  if (lineEnd >= text.length) return text.length
  return lineEnd + 1
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
