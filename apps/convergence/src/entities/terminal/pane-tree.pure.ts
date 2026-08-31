import type {
  LeafNode,
  PaneTree,
  SplitDirection,
  SplitNode,
  TerminalTab,
} from './terminal.types'

const MIN_SIZE = 5

export function makeLeaf(id: string, tab: TerminalTab): LeafNode {
  return { kind: 'leaf', id, tabs: [tab], activeTabId: tab.id }
}

export function findLeaf(
  tree: PaneTree,
  leafId: string,
): { path: number[]; leaf: LeafNode } | null {
  if (tree.kind === 'leaf') {
    return tree.id === leafId ? { path: [], leaf: tree } : null
  }
  for (let i = 0; i < tree.children.length; i++) {
    const found = findLeaf(tree.children[i]!, leafId)
    if (found) {
      return { path: [i, ...found.path], leaf: found.leaf }
    }
  }
  return null
}

export function collectAllPtyIds(tree: PaneTree): string[] {
  if (tree.kind === 'leaf') {
    return tree.tabs.map((tab) => tab.id)
  }
  return tree.children.flatMap(collectAllPtyIds)
}

function mapTree(tree: PaneTree, fn: (t: PaneTree) => PaneTree): PaneTree {
  const next = fn(tree)
  if (next !== tree) return next
  if (tree.kind === 'split') {
    let changed = false
    const children = tree.children.map((child) => {
      const mapped = mapTree(child, fn)
      if (mapped !== child) changed = true
      return mapped
    })
    if (changed) {
      return { ...tree, children }
    }
  }
  return tree
}

export function insertTab(
  tree: PaneTree,
  leafId: string,
  tab: TerminalTab,
): PaneTree {
  return mapTree(tree, (node) => {
    if (node.kind === 'leaf' && node.id === leafId) {
      return { ...node, tabs: [...node.tabs, tab], activeTabId: tab.id }
    }
    return node
  })
}

export function splitLeaf(
  tree: PaneTree,
  leafId: string,
  direction: SplitDirection,
  newLeaf: LeafNode,
  newSplitId: string,
): PaneTree {
  return mapTree(tree, (node) => {
    if (node.kind === 'leaf' && node.id === leafId) {
      const next: SplitNode = {
        kind: 'split',
        id: newSplitId,
        direction,
        children: [node, newLeaf],
        sizes: [50, 50],
      }
      return next
    }
    return node
  })
}

export function setActiveTab(
  tree: PaneTree,
  leafId: string,
  tabId: string,
): PaneTree {
  return mapTree(tree, (node) => {
    if (node.kind === 'leaf' && node.id === leafId) {
      if (!node.tabs.some((t) => t.id === tabId)) return node
      if (node.activeTabId === tabId) return node
      return { ...node, activeTabId: tabId }
    }
    return node
  })
}

export function updateSizes(
  tree: PaneTree,
  splitId: string,
  sizes: number[],
): PaneTree {
  return mapTree(tree, (node) => {
    if (node.kind === 'split' && node.id === splitId) {
      if (sizes.length !== node.children.length) return node
      const clamped = sizes.map((s) => (s > MIN_SIZE ? s : MIN_SIZE))
      const total = clamped.reduce((a, b) => a + b, 0)
      if (total <= 0) return node
      const normalized = clamped.map((s) => (s / total) * 100)
      return { ...node, sizes: normalized }
    }
    return node
  })
}

interface RemoveTabResult {
  tree: PaneTree | null
  ptyIdsToDispose: string[]
}

export function removeTab(
  tree: PaneTree,
  leafId: string,
  tabId: string,
): RemoveTabResult {
  const found = findLeaf(tree, leafId)
  if (!found) return { tree, ptyIdsToDispose: [] }
  const leaf = found.leaf
  const tabIndex = leaf.tabs.findIndex((t) => t.id === tabId)
  if (tabIndex === -1) return { tree, ptyIdsToDispose: [] }

  const disposed: string[] = [tabId]
  const remainingTabs = leaf.tabs.filter((t) => t.id !== tabId)

  if (remainingTabs.length > 0) {
    const nextActive =
      leaf.activeTabId === tabId
        ? (remainingTabs[tabIndex - 1] ?? remainingTabs[0])!.id
        : leaf.activeTabId
    const nextLeaf: LeafNode = {
      ...leaf,
      tabs: remainingTabs,
      activeTabId: nextActive,
    }
    return {
      tree: replaceLeaf(tree, leafId, nextLeaf),
      ptyIdsToDispose: disposed,
    }
  }

  return {
    tree: collapseLeaf(tree, leafId),
    ptyIdsToDispose: disposed,
  }
}

function replaceLeaf(
  tree: PaneTree,
  leafId: string,
  replacement: LeafNode,
): PaneTree {
  return mapTree(tree, (node) => {
    if (node.kind === 'leaf' && node.id === leafId) return replacement
    return node
  })
}

function collapseLeaf(tree: PaneTree, leafId: string): PaneTree | null {
  if (tree.kind === 'leaf') {
    return tree.id === leafId ? null : tree
  }
  const filteredChildren: PaneTree[] = []
  const filteredSizes: number[] = []
  let removedAny = false
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i]!
    const collapsed = collapseLeaf(child, leafId)
    if (collapsed === null) {
      removedAny = true
      continue
    }
    filteredChildren.push(collapsed)
    filteredSizes.push(tree.sizes[i]!)
  }
  if (filteredChildren.length === 0) return null
  if (filteredChildren.length === 1) return filteredChildren[0]!
  if (!removedAny && filteredChildren.every((c, i) => c === tree.children[i])) {
    return tree
  }
  const total = filteredSizes.reduce((a, b) => a + b, 0)
  const normalized =
    total > 0
      ? filteredSizes.map((s) => (s / total) * 100)
      : filteredChildren.map(() => 100 / filteredChildren.length)
  return { ...tree, children: filteredChildren, sizes: normalized }
}
