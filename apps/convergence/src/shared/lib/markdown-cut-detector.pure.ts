const IMAGE_MD = /!\[([^\]]*)\]\([^)]*\)/g
const LINK_MD = /\[([^\]]*)\]\([^)]*\)/g
const CODE_FENCE_META = /```[\w-]*\n?/g
const HEAD_HASH = /^#{1,6}\s+/gm
const LIST_BULLET = /^\s*[-*+]\s+/gm
const ORDERED_LIST = /^\s*\d+\.\s+/gm
const BLOCKQUOTE = /^>\s?/gm
const TABLE_PIPE = /\|/g
const BOLD_ITALIC_CODE = /[*_~`]/g

export function stripMarkdownSyntax(input: string): string {
  return input
    .replace(IMAGE_MD, '$1')
    .replace(LINK_MD, '$1')
    .replace(CODE_FENCE_META, '')
    .replace(HEAD_HASH, '')
    .replace(LIST_BULLET, '')
    .replace(ORDERED_LIST, '')
    .replace(BLOCKQUOTE, '')
    .replace(TABLE_PIPE, ' ')
    .replace(BOLD_ITALIC_CODE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface MarkdownCutDetection {
  cut: boolean
  reason: 'tail-missing' | 'length-ratio' | null
  inputLen: number
  renderedLen: number
  strippedLen: number
  tailInput: string
  tailRendered: string
}

export interface DetectMarkdownCutOptions {
  input: string
  rendered: string
  tailLength?: number
  minInputLength?: number
  minRatio?: number
}

export function detectMarkdownCut({
  input,
  rendered,
  tailLength = 40,
  minInputLength = 200,
  minRatio = 0.5,
}: DetectMarkdownCutOptions): MarkdownCutDetection {
  const stripped = stripMarkdownSyntax(input)
  const renderedClean = rendered.replace(/\s+/g, ' ').trim()
  const result: MarkdownCutDetection = {
    cut: false,
    reason: null,
    inputLen: input.length,
    renderedLen: rendered.length,
    strippedLen: stripped.length,
    tailInput: stripped.slice(-tailLength),
    tailRendered: renderedClean.slice(-tailLength),
  }

  if (stripped.length < minInputLength) return result

  const tail = stripped.slice(-tailLength).trim()
  if (tail.length >= 20 && !renderedClean.includes(tail)) {
    result.cut = true
    result.reason = 'tail-missing'
    return result
  }

  if (renderedClean.length < stripped.length * minRatio) {
    result.cut = true
    result.reason = 'length-ratio'
  }

  return result
}
