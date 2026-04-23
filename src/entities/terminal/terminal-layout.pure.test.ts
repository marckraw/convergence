import { describe, expect, it } from 'vitest'
import { serializePaneTree } from './terminal-layout.pure'
import type { LeafNode, PaneTree, SplitNode } from './terminal.types'

const runtimeLeaf: LeafNode = {
  kind: 'leaf',
  id: 'leaf-1',
  activeTabId: 'tab-1',
  tabs: [
    {
      id: 'tab-1',
      cwd: '/work',
      title: 'zsh',
      pid: 42,
      shell: '/bin/zsh',
      status: 'running',
      exitCode: null,
    },
  ],
}

describe('serializePaneTree', () => {
  it('strips pid, shell, status, exitCode from tabs', () => {
    const persisted = serializePaneTree(runtimeLeaf)
    expect(persisted).toEqual({
      kind: 'leaf',
      id: 'leaf-1',
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', cwd: '/work', title: 'zsh' }],
    })
  })

  it('recurses through splits and copies sizes', () => {
    const tree: SplitNode = {
      kind: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [40, 60],
      children: [
        runtimeLeaf,
        { ...runtimeLeaf, id: 'leaf-2', activeTabId: 'tab-2', tabs: [{ ...runtimeLeaf.tabs[0]!, id: 'tab-2' }] },
      ],
    }
    const persisted = serializePaneTree(tree)
    expect(persisted.kind).toBe('split')
    if (persisted.kind !== 'split') throw new Error('unreachable')
    expect(persisted.sizes).toEqual([40, 60])
    expect(persisted.children).toHaveLength(2)
  })

  it('returns a structurally independent sizes array', () => {
    const tree: PaneTree = {
      kind: 'split',
      id: 's',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        runtimeLeaf,
        { ...runtimeLeaf, id: 'leaf-2', activeTabId: 'tab-2', tabs: [{ ...runtimeLeaf.tabs[0]!, id: 'tab-2' }] },
      ],
    }
    const persisted = serializePaneTree(tree)
    if (persisted.kind !== 'split') throw new Error('unreachable')
    persisted.sizes[0] = 99
    expect((tree as SplitNode).sizes[0]).toBe(50)
  })
})
