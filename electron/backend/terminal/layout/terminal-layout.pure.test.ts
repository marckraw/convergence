import { describe, expect, it } from 'vitest'
import {
  tryValidatePersistedTree,
  validatePersistedTree,
} from './terminal-layout.pure'
import type { PersistedPaneTree } from './terminal-layout.types'

const validLeaf: PersistedPaneTree = {
  kind: 'leaf',
  id: 'leaf-1',
  tabs: [
    { id: 'tab-1', cwd: '/tmp', title: 'zsh' },
    { id: 'tab-2', cwd: '/tmp/sub', title: 'bash' },
  ],
  activeTabId: 'tab-1',
}

const validSplit: PersistedPaneTree = {
  kind: 'split',
  id: 'split-1',
  direction: 'horizontal',
  sizes: [50, 50],
  children: [
    { ...validLeaf, id: 'leaf-a', tabs: [{ id: 'tab-a', cwd: '/a', title: 'a' }], activeTabId: 'tab-a' },
    { ...validLeaf, id: 'leaf-b', tabs: [{ id: 'tab-b', cwd: '/b', title: 'b' }], activeTabId: 'tab-b' },
  ],
}

describe('validatePersistedTree', () => {
  it('accepts a well-formed leaf', () => {
    const tree = validatePersistedTree(JSON.parse(JSON.stringify(validLeaf)))
    expect(tree).toEqual(validLeaf)
  })

  it('accepts a well-formed split', () => {
    const tree = validatePersistedTree(JSON.parse(JSON.stringify(validSplit)))
    expect(tree.kind).toBe('split')
  })

  it('accepts nested splits with sizes summing to 100 within tolerance', () => {
    const nested = {
      kind: 'split',
      id: 's-root',
      direction: 'vertical',
      sizes: [33.4, 33.3, 33.3],
      children: [
        { kind: 'leaf', id: 'l1', tabs: [{ id: 't1', cwd: '/', title: 'a' }], activeTabId: 't1' },
        { kind: 'leaf', id: 'l2', tabs: [{ id: 't2', cwd: '/', title: 'b' }], activeTabId: 't2' },
        { kind: 'leaf', id: 'l3', tabs: [{ id: 't3', cwd: '/', title: 'c' }], activeTabId: 't3' },
      ],
    }
    expect(() => validatePersistedTree(nested)).not.toThrow()
  })

  it('rejects a leaf with no tabs', () => {
    const { error } = tryValidatePersistedTree({
      kind: 'leaf',
      id: 'x',
      tabs: [],
      activeTabId: 't',
    })
    expect(error?.reason).toBe('empty-tabs')
  })

  it('rejects a leaf whose activeTabId is not in tabs', () => {
    const { error } = tryValidatePersistedTree({
      kind: 'leaf',
      id: 'x',
      tabs: [{ id: 't', cwd: '/', title: 'a' }],
      activeTabId: 'missing',
    })
    expect(error?.reason).toBe('active-tab-id-missing')
  })

  it('rejects a split with fewer than two children', () => {
    const { error } = tryValidatePersistedTree({
      kind: 'split',
      id: 's',
      direction: 'horizontal',
      sizes: [100],
      children: [{ kind: 'leaf', id: 'l', tabs: [{ id: 't', cwd: '/', title: 'a' }], activeTabId: 't' }],
    })
    expect(error?.reason).toBe('too-few-children')
  })

  it('rejects sizes that do not match children length', () => {
    const { error } = tryValidatePersistedTree({
      kind: 'split',
      id: 's',
      direction: 'horizontal',
      sizes: [50, 25, 25],
      children: [
        { kind: 'leaf', id: 'l1', tabs: [{ id: 't1', cwd: '/', title: 'a' }], activeTabId: 't1' },
        { kind: 'leaf', id: 'l2', tabs: [{ id: 't2', cwd: '/', title: 'b' }], activeTabId: 't2' },
      ],
    })
    expect(error?.reason).toBe('sizes-length-mismatch')
  })

  it('rejects sizes that do not sum to ~100', () => {
    const { error } = tryValidatePersistedTree({
      kind: 'split',
      id: 's',
      direction: 'horizontal',
      sizes: [40, 40],
      children: [
        { kind: 'leaf', id: 'l1', tabs: [{ id: 't1', cwd: '/', title: 'a' }], activeTabId: 't1' },
        { kind: 'leaf', id: 'l2', tabs: [{ id: 't2', cwd: '/', title: 'b' }], activeTabId: 't2' },
      ],
    })
    expect(error?.reason).toBe('sizes-sum-mismatch')
  })

  it('rejects duplicate ids anywhere in the tree', () => {
    const { error } = tryValidatePersistedTree({
      kind: 'split',
      id: 'dup',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { kind: 'leaf', id: 'dup', tabs: [{ id: 't1', cwd: '/', title: 'a' }], activeTabId: 't1' },
        { kind: 'leaf', id: 'l2', tabs: [{ id: 't2', cwd: '/', title: 'b' }], activeTabId: 't2' },
      ],
    })
    expect(error?.reason).toBe('duplicate-id')
  })

  it('rejects unknown node kinds', () => {
    const { error } = tryValidatePersistedTree({ kind: 'other', id: 'x' })
    expect(error?.reason).toBe('unknown-kind')
  })

  it('rejects non-object input', () => {
    const { error } = tryValidatePersistedTree(null)
    expect(error?.reason).toBe('not-object')
  })
})
