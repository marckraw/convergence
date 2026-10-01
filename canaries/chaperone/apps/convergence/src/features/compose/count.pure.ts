// canary: pure-functions-tested
// countWords is exported, and its sibling test never calls it.
export function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length
}
