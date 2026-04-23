import type {
  PersistedLeaf,
  PersistedPaneTree,
  PersistedSplit,
  PersistedTerminalTab,
  TerminalLayoutValidationError,
} from './terminal-layout.types'

const MAX_DEPTH = 20
const SIZE_TOLERANCE = 0.5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTab(input: unknown, path: string): PersistedTerminalTab {
  if (!isRecord(input)) {
    throw Object.assign(new Error(`${path}: tab must be an object`), {
      reason: 'not-object',
      path,
    })
  }
  const { id, cwd, title } = input
  if (typeof id !== 'string' || id.length === 0) {
    throw Object.assign(new Error(`${path}: tab.id must be a non-empty string`), {
      reason: 'invalid-id',
      path,
    })
  }
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw Object.assign(new Error(`${path}: tab.cwd must be a non-empty string`), {
      reason: 'invalid-cwd',
      path,
    })
  }
  if (typeof title !== 'string') {
    throw Object.assign(new Error(`${path}: tab.title must be a string`), {
      reason: 'invalid-title',
      path,
    })
  }
  return { id, cwd, title }
}

function parseNode(input: unknown, path: string, depth: number): PersistedPaneTree {
  if (depth > MAX_DEPTH) {
    throw Object.assign(new Error(`${path}: tree exceeds max depth ${MAX_DEPTH}`), {
      reason: 'max-depth',
      path,
    })
  }
  if (!isRecord(input)) {
    throw Object.assign(new Error(`${path}: node must be an object`), {
      reason: 'not-object',
      path,
    })
  }
  const kind = input.kind
  if (kind === 'leaf') {
    const id = input.id
    const activeTabId = input.activeTabId
    const rawTabs = input.tabs
    if (typeof id !== 'string' || id.length === 0) {
      throw Object.assign(new Error(`${path}: leaf.id must be a non-empty string`), {
        reason: 'invalid-id',
        path,
      })
    }
    if (!Array.isArray(rawTabs) || rawTabs.length === 0) {
      throw Object.assign(new Error(`${path}: leaf must have at least one tab`), {
        reason: 'empty-tabs',
        path,
      })
    }
    if (typeof activeTabId !== 'string' || activeTabId.length === 0) {
      throw Object.assign(
        new Error(`${path}: leaf.activeTabId must be a non-empty string`),
        { reason: 'invalid-active-tab-id', path },
      )
    }
    const tabs = rawTabs.map((tab, index) => parseTab(tab, `${path}.tabs[${index}]`))
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      throw Object.assign(
        new Error(`${path}: activeTabId "${activeTabId}" not found in tabs`),
        { reason: 'active-tab-id-missing', path },
      )
    }
    const leaf: PersistedLeaf = { kind: 'leaf', id, tabs, activeTabId }
    return leaf
  }
  if (kind === 'split') {
    const id = input.id
    const direction = input.direction
    const rawChildren = input.children
    const rawSizes = input.sizes
    if (typeof id !== 'string' || id.length === 0) {
      throw Object.assign(new Error(`${path}: split.id must be a non-empty string`), {
        reason: 'invalid-id',
        path,
      })
    }
    if (direction !== 'horizontal' && direction !== 'vertical') {
      throw Object.assign(
        new Error(`${path}: split.direction must be "horizontal" or "vertical"`),
        { reason: 'invalid-direction', path },
      )
    }
    if (!Array.isArray(rawChildren) || rawChildren.length < 2) {
      throw Object.assign(
        new Error(`${path}: split must have at least two children`),
        { reason: 'too-few-children', path },
      )
    }
    if (!Array.isArray(rawSizes) || rawSizes.length !== rawChildren.length) {
      throw Object.assign(
        new Error(`${path}: split.sizes length must equal children length`),
        { reason: 'sizes-length-mismatch', path },
      )
    }
    for (const size of rawSizes) {
      if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
        throw Object.assign(
          new Error(`${path}: split.sizes must be positive finite numbers`),
          { reason: 'invalid-size', path },
        )
      }
    }
    const sum = rawSizes.reduce((acc, size) => acc + size, 0)
    if (Math.abs(sum - 100) > SIZE_TOLERANCE) {
      throw Object.assign(
        new Error(`${path}: split.sizes must sum to 100 (got ${sum})`),
        { reason: 'sizes-sum-mismatch', path },
      )
    }
    const children = rawChildren.map((child, index) =>
      parseNode(child, `${path}.children[${index}]`, depth + 1),
    )
    const split: PersistedSplit = {
      kind: 'split',
      id,
      direction,
      children,
      sizes: rawSizes as number[],
    }
    return split
  }
  throw Object.assign(new Error(`${path}: unknown node kind "${String(kind)}"`), {
    reason: 'unknown-kind',
    path,
  })
}

function collectIds(
  tree: PersistedPaneTree,
  seen: Set<string>,
  path: string,
): void {
  if (seen.has(tree.id)) {
    throw Object.assign(new Error(`${path}: duplicate node id "${tree.id}"`), {
      reason: 'duplicate-id',
      path,
    })
  }
  seen.add(tree.id)
  if (tree.kind === 'leaf') {
    for (const tab of tree.tabs) {
      if (seen.has(tab.id)) {
        throw Object.assign(new Error(`${path}: duplicate tab id "${tab.id}"`), {
          reason: 'duplicate-id',
          path,
        })
      }
      seen.add(tab.id)
    }
    return
  }
  tree.children.forEach((child, index) =>
    collectIds(child, seen, `${path}.children[${index}]`),
  )
}

export function validatePersistedTree(input: unknown): PersistedPaneTree {
  const tree = parseNode(input, '$', 0)
  collectIds(tree, new Set(), '$')
  return tree
}

export function tryValidatePersistedTree(input: unknown): {
  tree: PersistedPaneTree | null
  error: TerminalLayoutValidationError | null
} {
  try {
    return { tree: validatePersistedTree(input), error: null }
  } catch (err) {
    const reason =
      err && typeof err === 'object' && 'reason' in err
        ? String((err as { reason: unknown }).reason)
        : 'unknown'
    const path =
      err && typeof err === 'object' && 'path' in err
        ? String((err as { path: unknown }).path)
        : '$'
    return { tree: null, error: { reason, path } }
  }
}
