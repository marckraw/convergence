export const SECRET_COLUMN =
  /token|secret|password|api[_-]?key|authorization|credential/i

// Consume the whole credential, including provider-specific hyphenated prefixes.
// PEM blocks can occur literally or with escaped newlines inside JSON text.
const TOKEN_PATTERN =
  /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----|-----BEGIN [A-Z ]*PRIVATE KEY|lin_api_[A-Za-z0-9]+|sk-(?:(?:ant|or|proj)-[A-Za-z0-9_-]+|[A-Za-z0-9]{20,})|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[abp]-[A-Za-z0-9-]{10,}|cvg_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|Authorization: *Bearer [A-Za-z0-9._-]{16,}/g

export function maskTokens(value: string): { value: string; count: number } {
  let count = 0
  const masked = value.replace(TOKEN_PATTERN, (match) => {
    count++
    // SQLite length(TEXT) counts Unicode code points, including inside PEM blocks.
    return match.replace(/[\s\S]/gu, 'x')
  })
  return { value: masked, count }
}

export function hasTokens(value: string): boolean {
  TOKEN_PATTERN.lastIndex = 0
  const found = TOKEN_PATTERN.test(value)
  TOKEN_PATTERN.lastIndex = 0
  return found
}

export function scrubStateJson(value: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return value
  }
  let changed = false
  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => {
          if (SECRET_COLUMN.test(key)) {
            changed = true
            return [key, '<scrubbed>']
          }
          return [key, walk(child)]
        }),
      )
    }
    return node
  }
  const scrubbed = walk(parsed)
  return changed ? JSON.stringify(scrubbed) : value
}
