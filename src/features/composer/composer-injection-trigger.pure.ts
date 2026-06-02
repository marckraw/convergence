export interface ComposerInjectionTriggerRange {
  start: number
  end: number
}

export type ComposerInjectionKind = 'context' | 'skill' | 'prompt'

export interface ComposerInjectionRootItem {
  kind: ComposerInjectionKind
  label: string
  alias: string
  canonicalTrigger: string
  description: string
  searchText: string
}

export type ComposerInjectionTrigger =
  | {
      open: true
      kind: 'root'
      query: string
      range: ComposerInjectionTriggerRange
    }
  | {
      open: true
      kind: ComposerInjectionKind
      query: string
      range: ComposerInjectionTriggerRange
      alias: string
    }
  | { open: false }

const TRIGGER = '::'

const ALIASES: Record<string, ComposerInjectionKind> = {
  c: 'context',
  context: 'context',
  p: 'prompt',
  prompt: 'prompt',
  s: 'skill',
  skill: 'skill',
}

const ROOT_ITEMS: ComposerInjectionRootItem[] = [
  {
    kind: 'context',
    label: 'Context',
    alias: 'c',
    canonicalTrigger: '::context::',
    description: 'Project context',
    searchText: 'c context project note notes',
  },
  {
    kind: 'skill',
    label: 'Skill',
    alias: 's',
    canonicalTrigger: '::skill::',
    description: 'Provider skill',
    searchText: 's skill provider capability',
  },
  {
    kind: 'prompt',
    label: 'Prompt',
    alias: 'p',
    canonicalTrigger: '::prompt::',
    description: 'Reusable prompt',
    searchText: 'p prompt reusable template library',
  },
]

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch)
}

function findTokenStart(text: string, cursor: number): number {
  let start = cursor
  while (start > 0) {
    const ch = text[start - 1]
    if (isWhitespace(ch)) break
    start--
  }
  return start
}

function hasWhitespace(value: string): boolean {
  return /\s/.test(value)
}

export function resolveComposerInjectionAlias(
  alias: string,
): ComposerInjectionKind | null {
  return ALIASES[alias.trim().toLowerCase()] ?? null
}

export function detectComposerInjectionTrigger(
  text: string,
  cursor: number,
): ComposerInjectionTrigger {
  if (cursor < TRIGGER.length) return { open: false }
  if (cursor > text.length) return { open: false }

  const tokenStart = findTokenStart(text, cursor)
  const token = text.slice(tokenStart, cursor)
  if (!token.startsWith(TRIGGER)) return { open: false }
  if (token.startsWith(':::')) return { open: false }
  if (hasWhitespace(token)) return { open: false }

  const body = token.slice(TRIGGER.length)
  const range = { start: tokenStart, end: cursor }
  const namespaceEnd = body.indexOf(TRIGGER)

  if (namespaceEnd === -1) {
    return {
      open: true,
      kind: 'root',
      query: body,
      range,
    }
  }

  const alias = body.slice(0, namespaceEnd)
  const kind = resolveComposerInjectionAlias(alias)
  if (!kind) return { open: false }

  return {
    open: true,
    kind,
    alias,
    query: body.slice(namespaceEnd + TRIGGER.length),
    range,
  }
}

export function replaceComposerInjectionRange(
  text: string,
  range: ComposerInjectionTriggerRange,
  replacement: string,
): { text: string; cursor: number } {
  const before = text.slice(0, range.start)
  const after = text.slice(range.end)
  return {
    text: `${before}${replacement}${after}`,
    cursor: range.start + replacement.length,
  }
}

export function filterComposerInjectionRootItems(input: {
  query: string
  includeContext: boolean
  includePrompt: boolean
  includeSkill: boolean
}): ComposerInjectionRootItem[] {
  const normalizedQuery = input.query.trim().toLowerCase()
  return ROOT_ITEMS.filter((item) => {
    if (item.kind === 'context' && !input.includeContext) return false
    if (item.kind === 'prompt' && !input.includePrompt) return false
    if (item.kind === 'skill' && !input.includeSkill) return false
    if (!normalizedQuery) return true
    if (normalizedQuery.length === 1) return item.alias === normalizedQuery
    return item.searchText
      .split(/\s+/)
      .some((token) => token.startsWith(normalizedQuery))
  })
}
