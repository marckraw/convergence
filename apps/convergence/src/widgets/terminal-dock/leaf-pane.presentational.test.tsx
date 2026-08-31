import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { LeafNode } from '@/entities/terminal'
import { LeafPaneView } from './leaf-pane.presentational'

vi.mock('@/features/terminal-pane', () => ({
  TerminalPaneContainer: () => <div data-testid="pane" />,
  PaneToolbar: () => <div data-testid="toolbar" />,
}))

function leaf(): LeafNode {
  return {
    kind: 'leaf',
    id: 'leaf-1',
    activeTabId: 'tab-1',
    tabs: [
      {
        id: 'tab-1',
        cwd: '/tmp',
        title: 'zsh',
        pid: 1,
        shell: '/bin/zsh',
        status: 'running',
        exitCode: null,
      },
    ],
  }
}

describe('LeafPaneView', () => {
  it('root stretches to full width so single-leaf dock fills the container', () => {
    const { container } = render(
      <LeafPaneView
        leaf={leaf()}
        sessionId="s1"
        focusedLeafId={null}
        onSelectTab={vi.fn()}
        onNewTab={vi.fn()}
        onSplit={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onCloseTab={vi.fn()}
        onFocusLeaf={vi.fn()}
      />,
    )
    const root = container.querySelector('[data-leaf-id="leaf-1"]')
    expect(root).not.toBeNull()
    expect(root!.className).toContain('w-full')
    expect(root!.className).toContain('h-full')
  })
})
