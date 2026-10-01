import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TerminalTab } from '@/entities/terminal'
import { TabGroup } from './tab-group.presentational'

function tab(id: string, overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id,
    cwd: `/tmp/${id}`,
    title: id,
    pid: 1,
    shell: '/bin/zsh',
    status: 'running',
    exitCode: null,
    ...overrides,
  }
}

function renderGroup(overrides: Partial<Parameters<typeof TabGroup>[0]> = {}) {
  const props = {
    tabs: [tab('zsh'), tab('vim', { status: 'exited' })],
    activeTabId: 'zsh',
    onSelect: vi.fn(),
    onCloseTab: vi.fn(),
    onNewTab: vi.fn(),
    ...overrides,
  }
  render(<TabGroup {...props} />)
  return props
}

describe('TabGroup (MAR-3616 DS3c: the terminal strip on the kit Tabs)', () => {
  it('lists the tabs as tabs, the open one selected, in a dark scope', () => {
    renderGroup()
    const list = screen.getByRole('tablist', { name: 'Terminal tabs' })
    expect(screen.getByRole('tab', { name: 'zsh' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'vim (exited)' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    // R12: the strip resolves the dark theme in both themes.
    expect(list.closest('[data-theme]')).toHaveAttribute('data-theme', 'dark')
  })

  it('selects a tab on click (mutation: drop onValueChange)', () => {
    const props = renderGroup()
    fireEvent.click(screen.getByRole('tab', { name: 'vim (exited)' }))
    expect(props.onSelect).toHaveBeenCalledWith('vim')
  })

  it('closes a tab from its x or with Delete on the tab (mutation: drop onClose)', () => {
    const props = renderGroup()
    fireEvent.click(screen.getByLabelText('Close tab vim'))
    expect(props.onCloseTab).toHaveBeenCalledWith('vim')
    expect(props.onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'zsh' }), {
      key: 'Delete',
    })
    expect(props.onCloseTab).toHaveBeenLastCalledWith('zsh')
  })

  it('keeps New tab outside the tab list, which holds only tabs', () => {
    const props = renderGroup()
    const list = screen.getByRole('tablist', { name: 'Terminal tabs' })
    const newTab = screen.getByRole('button', { name: 'New tab' })
    expect(list).not.toContainElement(newTab)
    fireEvent.click(newTab)
    expect(props.onNewTab).toHaveBeenCalledTimes(1)
  })
})
