import type { PaneTree } from './terminal.types'
import type { PersistedPaneTree } from './terminal-layout.types'

export function serializePaneTree(tree: PaneTree): PersistedPaneTree {
  if (tree.kind === 'leaf') {
    return {
      kind: 'leaf',
      id: tree.id,
      activeTabId: tree.activeTabId,
      tabs: tree.tabs.map((tab) => ({
        id: tab.id,
        cwd: tab.cwd,
        title: tab.title,
      })),
    }
  }
  return {
    kind: 'split',
    id: tree.id,
    direction: tree.direction,
    sizes: tree.sizes.slice(),
    children: tree.children.map(serializePaneTree),
  }
}
