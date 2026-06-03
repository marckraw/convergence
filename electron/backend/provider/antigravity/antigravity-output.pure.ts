function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n')
}

function trimOuterNewlines(value: string): string {
  return value.replace(/^\n+/, '').replace(/\n+$/, '')
}

function buildPrefixCandidates(previousAssistantTexts: string[]): string[] {
  const normalized = previousAssistantTexts
    .map((text) => trimOuterNewlines(normalizeNewlines(text)))
    .filter((text) => text.length > 0)

  if (normalized.length === 0) return []

  return [
    normalized.join('\n'),
    normalized.join('\n\n'),
    ...normalized.slice().reverse(),
  ]
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .sort((left, right) => right.length - left.length)
}

function removePrefix(text: string, prefix: string): string | null {
  if (text === prefix) return ''
  if (text.startsWith(`${prefix}\n`)) {
    return text.slice(prefix.length).replace(/^\n+/, '')
  }
  return null
}

export function extractAntigravityPrintDelta(input: {
  stdout: string
  previousAssistantTexts?: string[]
}): string {
  const text = trimOuterNewlines(normalizeNewlines(input.stdout))
  const candidates = buildPrefixCandidates(input.previousAssistantTexts ?? [])

  for (const candidate of candidates) {
    const withoutPrefix = removePrefix(text, candidate)
    if (withoutPrefix !== null) {
      return withoutPrefix
    }
  }

  return text
}
