const INPUT_CAP = 2000
const MAX_TITLE_LENGTH = 80

export const NAMING_INSTRUCTION =
  'Generate a concise 3-6 word title for the following conversation. ' +
  'Use Title Case. Do not wrap in quotes. No trailing punctuation. ' +
  'Output only the title, nothing else.'

function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text
  return text.slice(0, cap) + '…'
}

export function buildNamingPrompt(input: {
  firstUserMessage: string
  firstAssistantResponse: string
}): string {
  const user = truncate(input.firstUserMessage.trim(), INPUT_CAP)
  const assistant = truncate(input.firstAssistantResponse.trim(), INPUT_CAP)
  return [
    NAMING_INSTRUCTION,
    '',
    'Conversation:',
    '',
    `User: ${user}`,
    '',
    `Assistant: ${assistant}`,
  ].join('\n')
}

export function sanitizeTitle(raw: string): string | null {
  if (!raw) return null

  const firstLine = raw.split(/\r?\n/)[0] ?? ''
  let title = firstLine.trim()

  if (title.length === 0) return null

  title = title.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim()
  title = title.replace(/[.,;:!?\s]+$/g, '').trim()

  if (title.length === 0) return null
  if (title.length > MAX_TITLE_LENGTH) return null
  return title
}
