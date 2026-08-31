import { createHash } from 'crypto'
import { basename, extname, relative, resolve } from 'path'
import type {
  PromptLibraryEntry,
  PromptLibraryFileKind,
  PromptLibraryScope,
} from './prompts.types'

interface ParsedPromptFrontmatter {
  fields: Record<string, string>
  body: string
}

function cleanScalar(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export function parsePromptFrontmatter(
  markdown: string,
): ParsedPromptFrontmatter {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return {
      fields: {},
      body: markdown,
    }
  }

  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  )
  if (endIndex < 0) {
    return {
      fields: {},
      body: markdown,
    }
  }

  const fields: Record<string, string> = {}
  for (const line of lines.slice(1, endIndex)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || /^\s/.test(line)) {
      continue
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(line)
    if (!match) {
      continue
    }

    const value = cleanScalar(match[2] ?? '')
    if (value === '|' || value === '>') {
      continue
    }
    fields[match[1].toLowerCase()] = value
  }

  return {
    fields,
    body: lines.slice(endIndex + 1).join('\n'),
  }
}

function readField(fields: Record<string, string>, key: string): string | null {
  const value = fields[key.toLowerCase()]
  return value && value.trim() ? value.trim() : null
}

export function promptTagsFromField(value: string | null): string[] {
  if (!value) {
    return []
  }

  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((tag) => cleanScalar(tag).trim())
    .filter(Boolean)
}

function firstBodyParagraph(body: string): string | null {
  const paragraph: string[] = []

  for (const line of body.split(/\r?\n/)) {
    const text = line.replace(/^#+\s*/, '').trim()
    if (!text) {
      if (paragraph.length > 0) {
        break
      }
      continue
    }
    paragraph.push(text)
  }

  const summary = paragraph.join(' ').replace(/\s+/g, ' ').trim()
  return summary || null
}

function titleFromPath(path: string): string {
  const stem = basename(path, extname(path))
  return stem
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

export function promptKindFromPath(path: string): PromptLibraryFileKind | null {
  const extension = extname(path).toLowerCase()
  if (extension === '.md' || extension === '.markdown') {
    return 'markdown'
  }
  if (extension === '.txt') {
    return 'text'
  }
  return null
}

export function buildPromptLibraryId(input: {
  scope: PromptLibraryScope
  path: string
}): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ scope: input.scope, path: resolve(input.path) }))
    .digest('hex')
    .slice(0, 16)

  return `prompt:${input.scope}:${digest}`
}

export function buildPromptLibraryEntry(input: {
  path: string
  rootPath: string
  scope: PromptLibraryScope
  markdown: string
  sizeBytes: number
}): PromptLibraryEntry {
  const parsed = parsePromptFrontmatter(input.markdown)
  const title = readField(parsed.fields, 'title') ?? titleFromPath(input.path)
  const description =
    readField(parsed.fields, 'description') ??
    firstBodyParagraph(parsed.body) ??
    ''
  const kind = promptKindFromPath(input.path) ?? 'text'

  return {
    id: buildPromptLibraryId({
      scope: input.scope,
      path: input.path,
    }),
    title,
    description,
    shortDescription: description.split(/\r?\n/)[0]?.trim() || null,
    path: resolve(input.path),
    relativePath: relative(resolve(input.rootPath), resolve(input.path)),
    scope: input.scope,
    sourceLabel: input.scope === 'project' ? 'Project' : 'Global',
    kind,
    tags: promptTagsFromField(readField(parsed.fields, 'tags')),
    sizeBytes: input.sizeBytes,
  }
}

export function stripPromptFrontmatter(markdown: string): string {
  return parsePromptFrontmatter(markdown).body.trim()
}
