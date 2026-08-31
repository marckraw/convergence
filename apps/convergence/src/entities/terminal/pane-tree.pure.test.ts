import { describe, it, expect } from 'vitest'
import type {
  LeafNode,
  PaneTree,
  SplitNode,
  TerminalTab,
} from './terminal.types'
import {
  collectAllPtyIds,
  findLeaf,
  insertTab,
  makeLeaf,
  removeTab,
  setActiveTab,
  splitLeaf,
  updateSizes,
} from './pane-tree.pure'

function makeTab(
  id: string,
  overrides: Partial<TerminalTab> = {},
): TerminalTab {
  return {
    id,
    cwd: '/tmp',
    title: 'zsh',
    pid: null,
    shell: '/bin/zsh',
    status: 'running',
    exitCode: null,
    ...overrides,
  }
}

function leaf(id: string, tabs: TerminalTab[], activeTabId?: string): LeafNode {
  return {
    kind: 'leaf',
    id,
    tabs,
    activeTabId: activeTabId ?? tabs[0]!.id,
  }
}

function split(
  id: string,
  direction: 'horizontal' | 'vertical',
  children: PaneTree[],
  sizes?: number[],
): SplitNode {
  return {
    kind: 'split',
    id,
    direction,
    children,
    sizes: sizes ?? children.map(() => 100 / children.length),
  }
}

describe('makeLeaf', () => {
  it('creates a leaf with one tab as the active tab', () => {
    const tab = makeTab('t1')
    const node = makeLeaf('l1', tab)
    expect(node).toEqual({
      kind: 'leaf',
      id: 'l1',
      tabs: [tab],
      activeTabId: 't1',
    })
  })
})

describe('findLeaf', () => {
  it('returns the leaf at the root', () => {
    const tree = leaf('l1', [makeTab('t1')])
    const found = findLeaf(tree, 'l1')
    expect(found?.leaf.id).toBe('l1')
    expect(found?.path).toEqual([])
  })

  it('returns the leaf in a nested split with its index path', () => {
    const inner = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t1')]),
      leaf('l2', [makeTab('t2')]),
    ])
    const tree = split('s0', 'vertical', [leaf('l0', [makeTab('t0')]), inner])
    const found = findLeaf(tree, 'l2')
    expect(found?.leaf.id).toBe('l2')
    expect(found?.path).toEqual([1, 1])
  })

  it('returns null when the leaf is not present', () => {
    const tree = leaf('l1', [makeTab('t1')])
    expect(findLeaf(tree, 'missing')).toBeNull()
  })
})

describe('insertTab', () => {
  it('appends a tab to the named leaf and sets it as active', () => {
    const tree = leaf('l1', [makeTab('t1')])
    const next = insertTab(tree, 'l1', makeTab('t2'))
    expect(next.kind).toBe('leaf')
    const lf = next as LeafNode
    expect(lf.tabs.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(lf.activeTabId).toBe('t2')
  })

  it('inserts into a nested leaf without touching siblings', () => {
    const tree = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t1')]),
      leaf('l2', [makeTab('t2')]),
    ])
    const next = insertTab(tree, 'l2', makeTab('t3'))
    expect(next.kind).toBe('split')
    const updated = findLeaf(next, 'l2')!.leaf
    expect(updated.tabs.map((t) => t.id)).toEqual(['t2', 't3'])
    expect(updated.activeTabId).toBe('t3')
    const untouched = findLeaf(next, 'l1')!.leaf
    expect(untouched.tabs.map((t) => t.id)).toEqual(['t1'])
  })

  it('returns the original tree when the leaf id is not found', () => {
    const tree = leaf('l1', [makeTab('t1')])
    expect(insertTab(tree, 'missing', makeTab('t2'))).toBe(tree)
  })
})

describe('splitLeaf', () => {
  it('replaces a root leaf with a split containing the original and the new leaf 50/50', () => {
    const tree = leaf('l1', [makeTab('t1')])
    const newLeaf = leaf('l2', [makeTab('t2')])
    const next = splitLeaf(tree, 'l1', 'horizontal', newLeaf, 's1')
    expect(next.kind).toBe('split')
    const sp = next as SplitNode
    expect(sp.direction).toBe('horizontal')
    expect(sp.sizes).toEqual([50, 50])
    expect(sp.children.map((c) => c.id)).toEqual(['l1', 'l2'])
  })

  it('nests splits inside an existing split', () => {
    const tree = split('s1', 'vertical', [
      leaf('l1', [makeTab('t1')]),
      leaf('l2', [makeTab('t2')]),
    ])
    const newLeaf = leaf('l3', [makeTab('t3')])
    const next = splitLeaf(tree, 'l2', 'horizontal', newLeaf, 's2')
    expect(next.kind).toBe('split')
    const parent = next as SplitNode
    expect(parent.children[0]!.id).toBe('l1')
    const nested = parent.children[1] as SplitNode
    expect(nested.kind).toBe('split')
    expect(nested.direction).toBe('horizontal')
    expect(nested.children.map((c) => c.id)).toEqual(['l2', 'l3'])
  })

  it('returns the original tree when the target leaf does not exist', () => {
    const tree = leaf('l1', [makeTab('t1')])
    const result = splitLeaf(
      tree,
      'missing',
      'horizontal',
      leaf('l2', [makeTab('t2')]),
      's1',
    )
    expect(result).toBe(tree)
  })
})

describe('removeTab', () => {
  it('removes a non-final tab and activates the previous sibling', () => {
    const tree = leaf('l1', [makeTab('t1'), makeTab('t2'), makeTab('t3')], 't2')
    const result = removeTab(tree, 'l1', 't2')
    expect(result.ptyIdsToDispose).toEqual(['t2'])
    const next = result.tree as LeafNode
    expect(next.tabs.map((t) => t.id)).toEqual(['t1', 't3'])
    expect(next.activeTabId).toBe('t1')
  })

  it('removes the first tab and activates the next sibling', () => {
    const tree = leaf('l1', [makeTab('t1'), makeTab('t2')], 't1')
    const result = removeTab(tree, 'l1', 't1')
    expect(result.ptyIdsToDispose).toEqual(['t1'])
    const next = result.tree as LeafNode
    expect(next.tabs.map((t) => t.id)).toEqual(['t2'])
    expect(next.activeTabId).toBe('t2')
  })

  it('removing the only tab in the only leaf returns a null tree', () => {
    const tree = leaf('l1', [makeTab('t1')])
    const result = removeTab(tree, 'l1', 't1')
    expect(result.tree).toBeNull()
    expect(result.ptyIdsToDispose).toEqual(['t1'])
  })

  it('collapses a 2-child split when the last tab of one leaf is removed', () => {
    const tree = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t1')]),
      leaf('l2', [makeTab('t2')]),
    ])
    const result = removeTab(tree, 'l1', 't1')
    expect(result.ptyIdsToDispose).toEqual(['t1'])
    const next = result.tree as LeafNode
    expect(next.kind).toBe('leaf')
    expect(next.id).toBe('l2')
  })

  it('rebalances a 3-child split when one leaf collapses', () => {
    const tree = split(
      's1',
      'vertical',
      [
        leaf('l1', [makeTab('t1')]),
        leaf('l2', [makeTab('t2')]),
        leaf('l3', [makeTab('t3')]),
      ],
      [30, 30, 40],
    )
    const result = removeTab(tree, 'l2', 't2')
    expect(result.ptyIdsToDispose).toEqual(['t2'])
    const next = result.tree as SplitNode
    expect(next.kind).toBe('split')
    expect(next.children.map((c) => c.id)).toEqual(['l1', 'l3'])
    expect(next.sizes).toHaveLength(2)
    expect(Math.round(next.sizes.reduce((a, b) => a + b, 0))).toBe(100)
  })

  it('propagates collapse through nested splits', () => {
    const inner = split('s-inner', 'horizontal', [
      leaf('l2', [makeTab('t2')]),
      leaf('l3', [makeTab('t3')]),
    ])
    const tree = split('s-outer', 'vertical', [
      leaf('l1', [makeTab('t1')]),
      inner,
    ])
    const step1 = removeTab(tree, 'l3', 't3')
    expect(step1.ptyIdsToDispose).toEqual(['t3'])
    const step1Tree = step1.tree as SplitNode
    expect(step1Tree.kind).toBe('split')
    expect(step1Tree.children.map((c) => c.id)).toEqual(['l1', 'l2'])
    const step2 = removeTab(step1Tree, 'l2', 't2')
    expect(step2.ptyIdsToDispose).toEqual(['t2'])
    const step2Tree = step2.tree as LeafNode
    expect(step2Tree.kind).toBe('leaf')
    expect(step2Tree.id).toBe('l1')
  })

  it('is a no-op when the target tab is not found', () => {
    const tree = leaf('l1', [makeTab('t1')])
    const result = removeTab(tree, 'l1', 'missing')
    expect(result.tree).toBe(tree)
    expect(result.ptyIdsToDispose).toEqual([])
  })
})

describe('updateSizes', () => {
  it('normalizes sizes that do not sum to 100', () => {
    const tree = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t1')]),
      leaf('l2', [makeTab('t2')]),
    ])
    const next = updateSizes(tree, 's1', [30, 80]) as SplitNode
    expect(Math.round(next.sizes[0]! + next.sizes[1]!)).toBe(100)
    expect(next.sizes[0]).toBeCloseTo((30 / 110) * 100, 5)
    expect(next.sizes[1]).toBeCloseTo((80 / 110) * 100, 5)
  })

  it('clamps non-positive values and renormalizes', () => {
    const tree = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t1')]),
      leaf('l2', [makeTab('t2')]),
    ])
    const next = updateSizes(tree, 's1', [0, 100]) as SplitNode
    expect(next.sizes[0]).toBeGreaterThan(0)
    expect(next.sizes[0]! + next.sizes[1]!).toBeCloseTo(100, 5)
  })

  it('returns the original tree when the split id is unknown', () => {
    const tree = split('s1', 'horizontal', [
      leaf('l1', [makeTab('t1')]),
      leaf('l2', [makeTab('t2')]),
    ])
    expect(updateSizes(tree, 'missing', [50, 50])).toBe(tree)
  })
})

describe('setActiveTab', () => {
  it('changes the active tab within a leaf', () => {
    const tree = leaf('l1', [makeTab('t1'), makeTab('t2')], 't1')
    const next = setActiveTab(tree, 'l1', 't2') as LeafNode
    expect(next.activeTabId).toBe('t2')
  })

  it('is a no-op when the tab id does not belong to the leaf', () => {
    const tree = leaf('l1', [makeTab('t1')], 't1')
    expect(setActiveTab(tree, 'l1', 'missing')).toBe(tree)
  })

  it('is a no-op when the leaf id does not exist', () => {
    const tree = leaf('l1', [makeTab('t1')], 't1')
    expect(setActiveTab(tree, 'missing', 't1')).toBe(tree)
  })
})

describe('collectAllPtyIds', () => {
  it('returns every tab id in DFS order across nested splits', () => {
    const tree = split('s0', 'vertical', [
      leaf('l1', [makeTab('t1'), makeTab('t2')]),
      split('s1', 'horizontal', [
        leaf('l2', [makeTab('t3')]),
        leaf('l3', [makeTab('t4'), makeTab('t5')]),
      ]),
    ])
    expect(collectAllPtyIds(tree)).toEqual(['t1', 't2', 't3', 't4', 't5'])
  })
})
