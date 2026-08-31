import type { LeafNode, PaneTree, SplitNode } from './terminal.types'

export type FocusDirection = 'up' | 'down' | 'left' | 'right'

function axisMatches(split: SplitNode, direction: FocusDirection): boolean {
  if (split.direction === 'horizontal') {
    return direction === 'left' || direction === 'right'
  }
  return direction === 'up' || direction === 'down'
}

function indexDelta(direction: FocusDirection): -1 | 1 {
  return direction === 'left' || direction === 'up' ? -1 : 1
}

function descendEdgeLeaf(tree: PaneTree, direction: FocusDirection): LeafNode {
  if (tree.kind === 'leaf') return tree
  let childIndex = 0
  if (axisMatches(tree, direction)) {
    childIndex =
      direction === 'right' || direction === 'down'
        ? 0
        : tree.children.length - 1
  }
  return descendEdgeLeaf(tree.children[childIndex]!, direction)
}

interface PathEntry {
  node: PaneTree
  indexInParent: number
}

function pathToLeaf(tree: PaneTree, leafId: string): PathEntry[] | null {
  if (tree.kind === 'leaf') {
    return tree.id === leafId ? [{ node: tree, indexInParent: -1 }] : null
  }
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i]!
    const sub = pathToLeaf(child, leafId)
    if (sub) {
      sub[0] = { ...sub[0]!, indexInParent: i }
      return [{ node: tree, indexInParent: -1 }, ...sub]
    }
  }
  return null
}

export function findAdjacentLeaf(
  tree: PaneTree,
  focusedLeafId: string,
  direction: FocusDirection,
): string | null {
  const path = pathToLeaf(tree, focusedLeafId)
  if (!path) return null

  for (let i = path.length - 1; i > 0; i--) {
    const parentEntry = path[i - 1]!
    const childEntry = path[i]!
    const parent = parentEntry.node
    if (parent.kind !== 'split') continue
    if (!axisMatches(parent, direction)) continue

    const targetIndex = childEntry.indexInParent + indexDelta(direction)
    if (targetIndex < 0 || targetIndex >= parent.children.length) continue

    const sibling = parent.children[targetIndex]!
    return descendEdgeLeaf(sibling, direction).id
  }

  return null
}
