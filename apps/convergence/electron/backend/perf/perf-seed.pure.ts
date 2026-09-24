export const SECRET_COLUMN =
  /token|secret|password|api[_-]?key|authorization|credential/i

// Consume the whole credential, including provider-specific hyphenated prefixes.
// PEM blocks can occur literally or with escaped newlines inside JSON text.
const TOKEN_PATTERN =
  /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----|-----BEGIN [A-Z ]*PRIVATE KEY|lin_api_[A-Za-z0-9]+|sk-(?:(?:ant|or|proj)-[A-Za-z0-9_-]+|[A-Za-z0-9]{20,})|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[abp]-[A-Za-z0-9-]{10,}|cvg_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|npm_[A-Za-z0-9]{36}|xai-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|hf_[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{20,}|Authorization: *Bearer [A-Za-z0-9._-]{16,}/g

function maskJsonSecrets(
  value: string,
  replace: (match: string) => string,
): { value: string; count: number } {
  let count = 0
  // Consume every complete string, even non-keys, so escaped quotes in prose
  // cannot masquerade as keys. Match raw spans to preserve JSON layout/length.
  const masked = value.replace(
    /("(?:\\[\s\S]|[^"\\])*")(?:(\s*:\s*)("(?:\\[\s\S]|[^"\\])*"))?/g,
    (match, key: string, separator: string, child: string | undefined) => {
      if (!child) return match
      let decoded: string
      try {
        decoded = JSON.parse(key) as string
      } catch {
        return match
      }
      if (!SECRET_COLUMN.test(decoded) || child === '"<scrubbed>"') return match
      // Replace escape sequences too: retaining a backslash could create invalid
      // JSON. Length is the stored TEXT code-point length, not decoded length.
      const replacement = `"${replace(child.slice(1, -1))}"`
      if (replacement === child) return match
      count++
      return key + separator + replacement
    },
  )
  return { value: masked, count }
}

function replaceTokens(
  value: string,
  replace: (match: string) => string,
): { value: string; count: number } {
  const json = maskJsonSecrets(value, replace)
  let count = json.count
  const masked = json.value.replace(TOKEN_PATTERN, (match) => {
    count++
    // SQLite length(TEXT) counts Unicode code points, including inside PEM blocks.
    return replace(match)
  })
  return { value: masked, count }
}

export function hasTokens(
  value: string,
  isFiller: (value: string) => boolean = () => false,
): boolean {
  TOKEN_PATTERN.lastIndex = 0
  const found = TOKEN_PATTERN.test(value)
  TOKEN_PATTERN.lastIndex = 0
  return (
    found ||
    maskJsonSecrets(value, (match) =>
      !match || isFiller(match) ? match : `${match}\0`,
    ).count > 0
  )
}

// The map belongs to one run only. Nothing derived from its contents is logged
// or serialized. ASCII punctuation keeps byte sizes realistic and JSON valid;
// filtering the alphabet also prevents retaining any character of the match.
export function createTokenMasker() {
  const originals = new Set<string>()
  const masks = new Map<string, string>()
  const fillers = new Set<string>()
  const nextByLength = new Map<number, bigint>()
  function reserve(value: string) {
    replaceTokens(value, (match) => {
      if (fillers.has(match)) throw new Error('mask namespace conflict')
      originals.add(match)
      return match
    })
  }
  function filler(original: string): string {
    if (!original) return original
    const existing = masks.get(original)
    if (existing !== undefined) return existing
    const length = [...original].length
    let alphabet = [...'!#$%&()*+,-./:;<=>?@[]^_{|}~'].filter(
      (char) => !original.includes(char),
    )
    let ordinal = nextByLength.get(length) ?? 0n
    let extended = false
    function extendAlphabet() {
      if (extended) throw new Error('mask namespace exhausted')
      extended = true
      alphabet = Array.from({ length: 6400 }, (_, index) =>
        String.fromCodePoint(0xe000 + index),
      ).filter((char) => !original.includes(char))
      if (alphabet.length < 2) throw new Error('mask alphabet exhausted')
    }
    for (;;) {
      // Short JSON secrets can exhaust ASCII punctuation. Private-use code
      // points remain JSON-safe, pattern-free and one SQLite character each.
      if (alphabet.length < 2) extendAlphabet()
      const base = BigInt(alphabet.length)
      let remaining = ordinal++
      let candidate = ''
      while (remaining > 0n) {
        candidate += alphabet[Number(remaining % base)]
        remaining /= base
      }
      if (candidate.length > length) {
        extendAlphabet()
        ordinal--
        continue
      }
      candidate = candidate.padEnd(length, alphabet[0])
      if (originals.has(candidate) || fillers.has(candidate)) continue
      masks.set(original, candidate)
      fillers.add(candidate)
      nextByLength.set(length, ordinal)
      return candidate
    }
  }
  return {
    reserve,
    maskTokens: (value: string) => replaceTokens(value, filler),
    hasTokens: (value: string) =>
      hasTokens(value, (match) => fillers.has(match)),
  }
}

export function maskTokens(value: string): { value: string; count: number } {
  const masker = createTokenMasker()
  masker.reserve(value)
  return masker.maskTokens(value)
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
          if (
            SECRET_COLUMN.test(key) &&
            child !== null &&
            (typeof child === 'string' || typeof child === 'object')
          ) {
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
