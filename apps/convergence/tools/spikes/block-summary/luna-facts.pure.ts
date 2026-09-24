export type BlockFactItem = {
  toolName: string
}

export type BlockForFacts = {
  items: BlockFactItem[]
  truth: { paths: string[] }
}

export type BlockFacts = {
  itemCount: number
  tools: { name: string; count: number }[]
  paths: string[]
}

/**
 * Tools, counts, and the paths a person needs beside a sentence.
 *
 * Parent directories and basenames stay in the lexical truth set. The table
 * shows each tool's count and the paths that are not a parent or a basename
 * of another path, so a file is listed once.
 */
export function blockFacts(block: BlockForFacts): BlockFacts {
  const counts = new Map<string, number>()
  for (const item of block.items) {
    counts.set(item.toolName, (counts.get(item.toolName) ?? 0) + 1)
  }
  return {
    itemCount: block.items.length,
    tools: [...counts].map(([name, count]) => ({ name, count })),
    paths: leafPaths(block.truth.paths),
  }
}

export function formatBlockFacts(facts: BlockFacts): string {
  const tools = facts.tools
    .map((tool) => `${tool.name} ×${tool.count}`)
    .join(', ')
  const paths = facts.paths.length ? facts.paths.join(', ') : 'none'
  return `${facts.itemCount} records; ${tools}; paths: ${paths}`
}

function leafPaths(paths: readonly string[]): string[] {
  return paths.filter(
    (path) =>
      !paths.some(
        (other) =>
          other !== path &&
          (other.startsWith(`${path}/`) || other.endsWith(`/${path}`)),
      ),
  )
}
