import type { ConversationItem } from '../session/conversation-item.types'
import type { SessionSummary } from '../session/session.types'

const MAX_CONTEXT_CHARS = 18_000
const MAX_RECENT_ITEMS = 16
const MAX_LIVING_HTML_CHARS = 24_000

export function buildSessionHtmlGenerationPrompt(input: {
  session: SessionSummary
  conversation: ConversationItem[]
  sourceItem: Extract<ConversationItem, { kind: 'message' }> & {
    actor: 'assistant'
  }
  currentLivingHtml?: string | null
}): string {
  const recentContext = serializeRecentConversation(input.conversation)
  const currentLivingHtml = serializeCurrentLivingHtml(input.currentLivingHtml)

  return `You are updating a companion HTML artifact for Convergence HTML mode.

The primary conversation already has a Markdown assistant response. Do not answer the user again. Create a complete standalone HTML document for the session's living page.

Rules:
- Return only HTML. Do not wrap it in Markdown fences.
- Include <!doctype html>, <html>, <head>, and <body>.
- Use inline CSS inside a <style> tag.
- Do not load remote scripts, remote stylesheets, fonts, images, or other network assets.
- Do not include Electron, Node, or filesystem APIs.
- Preserve and improve the existing living page when one is provided.
- Incorporate the latest assistant response as the newest meaningful section or update.
- Keep the page coherent as an evolving artifact, using recent context for continuity.
- Avoid duplicating old content unless the latest response genuinely revises it.

Session:
- id: ${input.session.id}
- name: ${input.session.name}
- provider: ${input.session.providerId}

Current living HTML:
${currentLivingHtml}

Recent conversation:
${recentContext}

Latest assistant response to render:
${input.sourceItem.text}`.trim()
}

export function normalizeGeneratedHtml(raw: string): string {
  const stripped = stripMarkdownFence(raw.trim())
  const htmlStart = findHtmlStart(stripped)
  const candidate = htmlStart >= 0 ? stripped.slice(htmlStart).trim() : stripped

  if (/^<!doctype\s+html/i.test(candidate) || /^<html[\s>]/i.test(candidate)) {
    return candidate
  }

  if (candidate.startsWith('<')) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Convergence HTML Mode</title>
</head>
<body>
${candidate}
</body>
</html>`
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Convergence HTML Mode</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; line-height: 1.5; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <pre>${escapeHtml(candidate)}</pre>
</body>
</html>`
}

function serializeRecentConversation(conversation: ConversationItem[]): string {
  const recent = conversation.slice(-MAX_RECENT_ITEMS)
  const lines = recent.map((item) => {
    switch (item.kind) {
      case 'message':
        return `${item.actor.toUpperCase()}: ${item.text}`
      case 'thinking':
        return `ASSISTANT THINKING: ${item.text}`
      case 'tool-call':
        return `TOOL CALL ${item.toolName}: ${item.inputText}`
      case 'tool-result':
        return `TOOL RESULT: ${item.outputText}`
      case 'approval-request':
        return `APPROVAL REQUEST: ${item.description}`
      case 'input-request':
        return `INPUT REQUEST: ${item.prompt}`
      case 'note':
        return `NOTE ${item.level.toUpperCase()}: ${item.text}`
    }
  })

  const serialized = lines.join('\n\n')
  if (serialized.length <= MAX_CONTEXT_CHARS) return serialized
  return serialized.slice(serialized.length - MAX_CONTEXT_CHARS)
}

function serializeCurrentLivingHtml(value: string | null | undefined): string {
  if (!value?.trim()) return 'No living HTML exists yet.'
  const trimmed = value.trim()
  if (trimmed.length <= MAX_LIVING_HTML_CHARS) return trimmed
  return trimmed.slice(trimmed.length - MAX_LIVING_HTML_CHARS)
}

function stripMarkdownFence(value: string): string {
  const match = value.match(/^```(?:html)?\s*\n([\s\S]*?)\n```$/i)
  return match ? match[1].trim() : value
}

function findHtmlStart(value: string): number {
  const doctypeIndex = value.search(/<!doctype\s+html/i)
  const htmlIndex = value.search(/<html[\s>]/i)
  if (doctypeIndex >= 0 && htmlIndex >= 0)
    return Math.min(doctypeIndex, htmlIndex)
  return Math.max(doctypeIndex, htmlIndex)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
