# Phase 9b: Terminal Splits and Tabs — Detailed Spec

> Parent: `docs/specs/phase-9-terminal-surface.md`
> Builds on: Phase 9a (single-pane PTY pipeline working end-to-end)
> Next: Phase 9c (dock integration, keyboard shortcuts, close-confirm, polish)

## Objective

Extend the 9a single-pane dock into a recursive pane tree with tabs. After this phase:

- a session can have multiple terminal panes arranged via horizontal and vertical splits to arbitrary depth
- each leaf pane can hold multiple tabs; only the active tab in each leaf runs in the foreground UI
- closing a tab collapses its leaf when it was the last tab; closing a leaf collapses its parent split when it was the last child
- splits are user-resizable by dragging the divider
- all tree mutations are backed by pure, unit-tested operations

Keyboard shortcuts and close-confirmation modal land in 9c. This phase ships tree + tab UI with button-based controls (new tab, split-h, split-v, close).

## Success Criteria

1. From a single pane, user can split horizontally and vertically via pane toolbar buttons; the split renders with a draggable divider.
2. Splits can be nested to arbitrary depth (tested to 4 levels); no layout corruption.
3. Dragging a divider resizes adjacent panes; each resized PTY receives a `resize(cols, rows)` call matching its new pixel size.
4. Each leaf pane has a tab bar with a "+" button; clicking "+" spawns a new PTY in the same cwd as the leaf and adds a tab.
5. Clicking a tab activates it; only the active tab's xterm instance is mounted for rendering (inactive tabs keep their PTY alive backend-side and buffer output into the ring buffer).
6. Closing the last tab in a leaf collapses the leaf; the parent split rebalances sizes across remaining children. Closing the last child of a split removes the split, promoting the single remaining sibling into the parent's slot.
7. Pane-tree operations are tested in isolation in `pane-tree.pure.test.ts` with ≥95% branch coverage.
8. Store actions map 1:1 onto pure tree operations; no mutation logic in the store itself.
9. Post-task verification passes: `npm run test:pure`, `npm run test:unit`, `chaperone check --fix`.

## Scope

### In scope

- New lib: `react-resizable-panels`
- New lib: `@radix-ui/react-tabs`
- Pane-tree types and pure operations (`src/entities/terminal/pane-tree.pure.ts`)
- Zustand store migration from "one pane per session" (9a) to "one tree per session" (9b)
- Backend: no changes required — PTY model already handles N terminals per window; only renderer state changes
- Recursive rendering widget: `split-node.presentational.tsx`
- Tab bar: `tab-group.presentational.tsx` over Radix Tabs
- Pane toolbar: new tab button, split-horizontal button, split-vertical button, close button
- Tab-inactive PTY handling: inactive tabs keep backend PTY alive, xterm instance unmounted; on reactivation, attach via `terminal.attach(id)` and replay ring buffer (already implemented in 9a)

### Out of scope (deferred to 9c)

- Keyboard shortcuts (Cmd-T, Cmd-D, Cmd-Shift-D, Cmd-W, etc.)
- Close-confirm modal for running processes
- Cmd-K clear
- Cmd-` dock toggle
- Dock top-edge height resize
- Drag-to-reorder tabs
- Drag panes between splits

### Also out of scope

- Per-tab custom cwd override (new tab inherits leaf's cwd)
- Renaming tabs
- Reordering tabs by click/drag (add/remove only in 9b; reorder shortcut Cmd-Shift-[/] lands in 9c)

## Data Model

### Types

```ts
// src/entities/terminal/terminal.types.ts

export type PaneTree = SplitNode | LeafNode

export interface SplitNode {
  kind: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: [PaneTree, PaneTree, ...PaneTree[]] // ≥2
  sizes: number[] // percentages, sum ≈ 100, length === children.length
}

export interface LeafNode {
  kind: 'leaf'
  id: string
  tabs: [TerminalTab, ...TerminalTab[]] // ≥1
  activeTabId: string
}

export interface TerminalTab {
  id: string // matches backend PTY id
  title: string // default: basename(shell), updates on `osc 0;…` title sequence (optional)
  cwd: string
  pid: number | null
  status: 'starting' | 'running' | 'exited'
}
```

Tree roots: each session has exactly one `PaneTree` (or `null` if no terminal opened yet). A tree of one pane is a single `LeafNode` with one tab.

### Store

```ts
// src/entities/terminal/terminal.model.ts

interface TerminalState {
  treesBySessionId: Record<string, PaneTree | null>
  focusedLeafBySessionId: Record<string, string | null> // leaf id
  focusedPaneBySessionId: Record<string, string | null> // ACTUAL xterm DOM focus (may differ from focusedLeaf during click transitions)

  openFirstPane(sessionId: string, cwd: string): Promise<void>
  newTab(sessionId: string, leafId: string): Promise<void>
  splitLeaf(
    sessionId: string,
    leafId: string,
    direction: 'horizontal' | 'vertical',
  ): Promise<void>
  closeTab(sessionId: string, leafId: string, tabId: string): Promise<void>
  setActiveTab(sessionId: string, leafId: string, tabId: string): void
  setFocusedLeaf(sessionId: string, leafId: string): void
  resizeSplit(sessionId: string, splitId: string, sizes: number[]): void
}
```

All mutations delegate to `pane-tree.pure.ts`. Store holds state and side effects (backend PTY create/dispose calls).

## Pure Tree Operations

```ts
// src/entities/terminal/pane-tree.pure.ts

export function findLeaf(
  tree: PaneTree,
  leafId: string,
): { path: number[]; leaf: LeafNode } | null

export function insertTab(
  tree: PaneTree,
  leafId: string,
  tab: TerminalTab,
): PaneTree

export function removeTab(
  tree: PaneTree,
  leafId: string,
  tabId: string,
): {
  tree: PaneTree | null // null if tree collapsed to empty
  ptyIdsToDispose: string[] // any PTYs orphaned by structural collapse (always ≥ the one closed tab)
}

export function splitLeaf(
  tree: PaneTree,
  leafId: string,
  direction: 'horizontal' | 'vertical',
  newLeaf: LeafNode,
): PaneTree

export function updateSizes(
  tree: PaneTree,
  splitId: string,
  sizes: number[],
): PaneTree

export function setActiveTab(
  tree: PaneTree,
  leafId: string,
  tabId: string,
): PaneTree

export function collectAllPtyIds(tree: PaneTree): string[]
```

Rules:

- trees are immutable; every op returns a new tree
- splitting a leaf replaces it with a `SplitNode` whose children are `[originalLeaf, newLeaf]` with sizes `[50, 50]`
- removing the last tab of a leaf collapses the leaf from its parent split; if the split is left with one child, the split collapses and that child replaces the split in the grandparent
- size arrays always sum to ≈100 after `updateSizes`; clamping + renormalization is the operation's job

### Tree operation test matrix

Test `pane-tree.pure.ts` with these cases:

- single leaf → split horizontal → 2-child horizontal split
- split twice in the same leaf → correct nesting
- remove tab from 1-tab leaf in 2-child split → split collapses, sibling promotes
- remove tab from 1-tab leaf in 3-child split → split stays, sizes rebalance
- remove tab from multi-tab leaf → leaf survives, next tab activates
- deeply nested: split → split → split → remove → collapse propagates correctly
- size update on 2-child split with 40/60 → request 30/80 clamps + normalizes to 27/73
- `collectAllPtyIds` returns every tab id across the tree in DFS order

## Deliverables

### Backend

No changes. 9a's service already supports N PTYs.

### Renderer

| File                                                                | What it does                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/entities/terminal/pane-tree.pure.ts`                           | Pure tree ops (see above)                                                          |
| `src/entities/terminal/pane-tree.pure.test.ts`                      | Full test matrix                                                                   |
| `src/entities/terminal/terminal.types.ts` (edit)                    | Add `PaneTree`, `SplitNode`, `LeafNode` types                                      |
| `src/entities/terminal/terminal.model.ts` (edit)                    | Replace single-pane state with tree-per-session; add tree actions                  |
| `src/entities/terminal/terminal.model.test.ts` (edit)               | Update and expand store tests for tree actions                                     |
| `src/features/terminal-pane/terminal-pane.container.tsx` (edit)     | Accept `tabId`; support attach-on-activate; dispose on close                       |
| `src/features/terminal-pane/pane-toolbar.presentational.tsx`        | Buttons: new tab, split-h, split-v, close                                          |
| `src/widgets/terminal-dock/split-node.presentational.tsx`           | Recursive renderer: `LeafNode` → tab-group + active pane; `SplitNode` → PanelGroup |
| `src/widgets/terminal-dock/tab-group.presentational.tsx`            | Radix Tabs over a leaf's tabs; "+" button adds tab                                 |
| `src/widgets/terminal-dock/terminal-dock.container.tsx` (edit)      | Render tree root for active session; handle focus events                           |
| `src/widgets/terminal-dock/terminal-dock.container.test.tsx` (edit) | Tree rendering, split/tab button wiring                                            |

### Dependencies

```
npm install react-resizable-panels @radix-ui/react-tabs
```

## UI Behavior Details

### Split rendering

`SplitNode` → `<PanelGroup direction={direction}>` with a `<Panel>` per child and `<PanelResizeHandle>` between. On resize, `onLayout` fires with new sizes; store dispatches `resizeSplit` which updates the pure tree.

Each child recursively renders as `<SplitNode tree={child} />` — same component handles both leaf and split cases via discriminated render.

### Tab rendering

`LeafNode` → small horizontal tab bar (24px) + content area below. Tab bar: Radix `<Tabs.Root value={activeTabId}>`, `<Tabs.List>` with one `<Tabs.Trigger>` per tab + a trailing "+" button. Content: only the active tab's `<TerminalPane tabId={activeTabId} />` mounts.

When user switches tabs, old `<TerminalPane>` unmounts → xterm disposed → backend `terminal.attach(newTabId)` called by the new mount → ring buffer replayed into fresh xterm instance. Backend PTYs never die during tab switch.

### Pane toolbar

Small toolbar per leaf (anchor top-right of tab bar, or floating over pane when hovered — TBD in implementation):

- `+`: new tab in this leaf (inherits cwd)
- split-horizontal icon
- split-vertical icon
- `×`: close active tab (last tab → close leaf)

Toolbar buttons are the only way to control the tree in 9b. Keyboard shortcuts in 9c.

### Focus tracking

`focusedLeafBySessionId` is set on pointer-down inside a leaf or tab switch. This doesn't affect 9b rendering — it seeds 9c's keyboard shortcuts (which target the focused leaf).

## Testing Strategy

### Pure

- `pane-tree.pure.test.ts`: full matrix above, ≥95% branch coverage

### Unit

- `terminal.model.test.ts`: every store action dispatches the correct tree op; side effects (PTY create/dispose) are called with correct args (mock `terminal.api.ts`)
- `terminal-dock.container.test.tsx`: renders nested splits, clicking split button mutates tree, clicking close collapses correctly

### Manual

After implementation:

```
# in running app, from a session with a terminal:
# 1. Click split-vertical → two panes side by side
# 2. Click split-horizontal on the right pane → top-right + bottom-right split
# 3. Drag divider → both panes reflow; cols/rows update
# 4. Click + in left pane → new tab in left pane
# 5. Switch tabs → each tab keeps its history (ring buffer replay)
# 6. Run `while true; do date; sleep 1; done` in tab A, switch to tab B, switch back → output accumulated
# 7. Close every tab in right pane → right pane collapses, left promotes to fill
# 8. Close last tab everywhere → tree goes to null → dock collapses (same as no-terminal state)
```

## Verification Gate

```
npm install
npm run test:pure
npm run test:unit
chaperone check --fix
```

All green. Manual checklist run on macOS.

## Risks

- **Pure tree ops complexity:** collapse propagation up multiple levels is the easiest place to introduce off-by-one bugs. Mitigate with exhaustive tests before wiring to store.
- **Focus management across splits:** Radix Tabs manages focus within a tab group; we need to ensure clicking a leaf focuses its active tab's xterm. Explicitly call `term.focus()` on leaf-focus change.
- **Ring buffer replay on tab switch:** if the buffer is truncated mid-sequence (ANSI escape split across the boundary), xterm may render garbage briefly. Acceptable for 9b; fix in 9c if visible (flush on UTF-8 boundaries, not mid-sequence).
- **react-resizable-panels + xterm fit:** panel size changes must trigger `fitAddon.fit()`. Subscribe to panel's `onResize` callback and call fit; debounce at 16ms to avoid fighting xterm's own resize handling.

## Boundaries

### Always do

- Mutate trees through pure ops only; no mutation logic in the store.
- Treat leaf collapse → split collapse → empty tree as a single atomic operation from the caller's view.
- Call `terminal.dispose(id)` for every tab id returned by `removeTab`'s `ptyIdsToDispose`.
- Call `fitAddon.fit()` after every layout change that resizes a pane.

### Ask first

- Allowing a tab's cwd to differ from its leaf's original cwd.
- Persisting tree structure to disk (still deferred).
- Adding animated transitions for split creation/collapse.

### Never do

- Mutate a tree in place.
- Create or dispose PTYs outside a store action (keeps side effects in one place).
- Let `ptyIdsToDispose` get dropped — every returned id must be disposed before the new tree state is applied.
