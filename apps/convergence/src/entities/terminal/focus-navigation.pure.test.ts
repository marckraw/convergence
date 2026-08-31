import { describe, expect, it } from 'vitest'
import { findAdjacentLeaf } from './focus-navigation.pure'
import type {
  LeafNode,
  PaneTree,
  SplitNode,
  TerminalTab,
} from './terminal.types'

function tab(id: string): TerminalTab {
  return {
    id,
    cwd: '/tmp',
    title: 'zsh',
    pid: 1,
    shell: '/bin/zsh',
    status: 'running',
    exitCode: null,
  }
}

function leaf(id: string): LeafNode {
  return { kind: 'leaf', id, tabs: [tab(`${id}-t`)], activeTabId: `${id}-t` }
}

function hsplit(id: string, children: PaneTree[]): SplitNode {
  return {
    kind: 'split',
    id,
    direction: 'horizontal',
    children,
    sizes: children.map(() => 100 / children.length),
  }
}

function vsplit(id: string, children: PaneTree[]): SplitNode {
  return {
    kind: 'split',
    id,
    direction: 'vertical',
    children,
    sizes: children.map(() => 100 / children.length),
  }
}

describe('findAdjacentLeaf', () => {
  it('returns null on a lone leaf', () => {
    expect(findAdjacentLeaf(leaf('A'), 'A', 'left')).toBeNull()
    expect(findAdjacentLeaf(leaf('A'), 'A', 'up')).toBeNull()
  })

  it('returns null when focused leaf is not in tree', () => {
    const tree = hsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'X', 'right')).toBeNull()
  })

  it('moves right across a horizontal split', () => {
    const tree = hsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'A', 'right')).toBe('B')
  })

  it('moves left across a horizontal split', () => {
    const tree = hsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'B', 'left')).toBe('A')
  })

  it('returns null moving up/down inside a horizontal split', () => {
    const tree = hsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'A', 'up')).toBeNull()
    expect(findAdjacentLeaf(tree, 'A', 'down')).toBeNull()
  })

  it('moves down across a vertical split', () => {
    const tree = vsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'A', 'down')).toBe('B')
  })

  it('moves up across a vertical split', () => {
    const tree = vsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'B', 'up')).toBe('A')
  })

  it('returns null at left edge of horizontal split', () => {
    const tree = hsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'A', 'left')).toBeNull()
  })

  it('returns null at right edge of horizontal split', () => {
    const tree = hsplit('s1', [leaf('A'), leaf('B')])
    expect(findAdjacentLeaf(tree, 'B', 'right')).toBeNull()
  })

  it('descends into nested split picking leftmost child when moving right', () => {
    // [A, [B (top), C (bottom)]]
    const tree = hsplit('s1', [leaf('A'), vsplit('s2', [leaf('B'), leaf('C')])])
    expect(findAdjacentLeaf(tree, 'A', 'right')).toBe('B')
  })

  it('descends into nested split picking rightmost child when moving left', () => {
    // [[B, C], A]  — moving left from A picks C (rightmost of left sibling)
    const tree = hsplit('s1', [hsplit('s2', [leaf('B'), leaf('C')]), leaf('A')])
    expect(findAdjacentLeaf(tree, 'A', 'left')).toBe('C')
  })

  it('walks up through multiple ancestors to find matching split', () => {
    // vertical split outer, horizontal inner
    // outer-v: [inner-h: [A, B], C]
    // From A, moving down should skip inner-h and find C
    const tree = vsplit('outer', [
      hsplit('inner', [leaf('A'), leaf('B')]),
      leaf('C'),
    ])
    expect(findAdjacentLeaf(tree, 'A', 'down')).toBe('C')
  })

  it('moving up from deeply nested leaf picks bottommost of sibling', () => {
    // outer-v: [X, inner-h: [A, B]]
    // From A, moving up → X
    const tree = vsplit('outer', [
      leaf('X'),
      hsplit('inner', [leaf('A'), leaf('B')]),
    ])
    expect(findAdjacentLeaf(tree, 'A', 'up')).toBe('X')
  })

  it('returns null when no ancestor matches direction', () => {
    // hsplit only: no vertical ancestors
    const tree = hsplit('s1', [leaf('A'), hsplit('s2', [leaf('B'), leaf('C')])])
    expect(findAdjacentLeaf(tree, 'B', 'up')).toBeNull()
    expect(findAdjacentLeaf(tree, 'B', 'down')).toBeNull()
  })

  it('picks nearest-edge leaf when descending into mismatched axis split', () => {
    // outer-h: [A, outer-v: [C, D]]
    // from A moving right → sibling is vsplit; axis mismatch, default to first child → C
    const tree = hsplit('outer', [
      leaf('A'),
      vsplit('inner', [leaf('C'), leaf('D')]),
    ])
    expect(findAdjacentLeaf(tree, 'A', 'right')).toBe('C')
  })
})
