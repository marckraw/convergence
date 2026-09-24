export type TruthBlock = { truth: { paths: string[]; toolNames: string[] } }

/** A lexical gate, not a proof of semantic truth; human review remains required. */
export function truthCheck(sentence: string, block: TruthBlock) {
  const reasons: string[] = []
  const text = sentence.trim()
  if (!text) reasons.push('empty')
  const wordCount = text ? text.split(/\s+/u).length : 0
  if (wordCount > 14) reasons.push('over-14-words')

  // Mask dotted paths before counting sentence punctuation.
  const pathPattern =
    /(?:\.?\.?\/)?(?:[\w@.-]+\/)+[\w@.-]+|\b[\w-]+(?:\.[\w-]+)+/gu
  const normalize = (path: string) =>
    path.replace(/[.!?]+$/u, '').replace(/\/$/u, '')
  const pathMentions = [...text.matchAll(pathPattern)].map((match) =>
    normalize(match[0]),
  )
  const masked = text.replace(
    pathPattern,
    (match) => `PATH${match.match(/[.!?]+$/u)?.[0] ?? ''}`,
  )
  const sentences = masked
    .split(/[.!?]+(?:\s+|$)/u)
    .filter((part) => part.trim())
  if (sentences.length > 1 || /[\r\n]/u.test(text))
    reasons.push('multiple-sentences')

  // Also catch explicit extensionless references: "folder banana" / "banana directory".
  for (const match of text.matchAll(
    /\b(?:file|folder|directory)\s+(?:named|called)\s+[`"']?([\w./-]+)/giu,
  ))
    pathMentions.push(normalize(match[1]))
  for (const match of text.matchAll(
    /\b(?:file|folder|directory)\s+[`"']?([\w./-]+)|[`"']?([\w./-]+)[`"']?\s+(?:file|folder|directory)\b/giu,
  )) {
    const mention = normalize(match[1] ?? match[2])
    if (
      ![
        'the',
        'a',
        'this',
        'that',
        'in',
        'under',
        'named',
        'called',
        'working',
        'current',
        'at',
        'paths',
      ].includes(mention.toLowerCase())
    )
      pathMentions.push(mention)
  }
  const unknownPaths = [
    ...new Set(
      pathMentions.filter((path) => !block.truth.paths.includes(path)),
    ),
  ]
  if (unknownPaths.length) reasons.push('invented-path')
  return { pass: reasons.length === 0, reasons, wordCount, unknownPaths }
}
