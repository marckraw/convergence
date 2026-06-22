import { fireEvent, render, screen } from '@testing-library/react'
import { selectOption } from '@/shared/testing/select-option'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/shared/ui/button'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { SkillsBrowserDialog } from './skills-browser.presentational'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDetails,
} from '@/entities/skill'
import {
  groupSkillsForGrid,
  type SkillBrowserFilters,
  type SkillBrowserProviderGroup,
} from './skills-browser.pure'
import { buildSkillsOverview } from './skills-overview.pure'

const filters: SkillBrowserFilters = {
  query: '',
  providerId: 'all',
  origin: 'all',
  scope: 'all',
  enabled: 'all',
  warnings: 'all',
  dependencyState: 'all',
}

const skill: SkillCatalogEntry = {
  id: 'skill-1',
  providerId: 'codex',
  providerName: 'Codex',
  name: 'review',
  displayName: 'Review',
  description: 'Review pull requests.',
  shortDescription: 'Review PRs',
  path: '/tmp/review/SKILL.md',
  scope: 'user',
  rawScope: 'user',
  sourceLabel: 'User',
  enabled: true,
  dependencies: [
    {
      kind: 'mcp',
      name: 'github',
      state: 'declared',
    },
  ],
  warnings: [
    {
      code: 'duplicate-name',
      message: 'Multiple Codex skills named "review" are available.',
    },
  ],
}

const catalog: ProjectSkillCatalog = {
  projectId: 'project-1',
  projectName: 'convergence',
  refreshedAt: '2026-04-25T00:00:00.000Z',
  providers: [
    {
      providerId: 'codex',
      providerName: 'Codex',
      catalogSource: 'native-rpc',
      invocationSupport: 'structured-input',
      activationConfirmation: 'none',
      error: null,
      skills: [skill],
    },
  ],
}

const groups: SkillBrowserProviderGroup[] = [
  {
    ...catalog.providers[0],
    skills: [skill],
  },
]

const details: SkillDetails = {
  skillId: skill.id,
  providerId: 'codex',
  path: '/tmp/review/SKILL.md',
  markdown: '# Review Skill\n\nUse this to review PRs.',
  sizeBytes: 38,
  resources: [
    {
      kind: 'script',
      name: 'run.sh',
      relativePath: 'scripts/run.sh',
    },
  ],
}

function renderDialog(
  overrides: Partial<Parameters<typeof SkillsBrowserDialog>[0]> = {},
) {
  const props: Parameters<typeof SkillsBrowserDialog>[0] = {
    open: true,
    onOpenChange: vi.fn(),
    trigger: <Button type="button">Open</Button>,
    projectName: 'convergence',
    catalog,
    viewMode: 'list',
    groupBy: 'provider',
    groups,
    gridGroups: groupSkillsForGrid(groups, 'provider'),
    overview: buildSkillsOverview(catalog),
    selectedSkill: skill,
    selectedDetails: details,
    isCatalogLoading: false,
    loadingProviderNames: [],
    catalogError: null,
    isDetailsLoading: false,
    detailsError: null,
    isDetailOpen: false,
    filters,
    providerOptions: [{ id: 'codex', label: 'Codex' }],
    totalSkillCount: 1,
    filteredSkillCount: 1,
    onViewModeChange: vi.fn(),
    onGroupByChange: vi.fn(),
    onFiltersChange: vi.fn(),
    onJumpToGrid: vi.fn(),
    onSelectSkill: vi.fn(),
    onCloseDetail: vi.fn(),
    onRefresh: vi.fn(),
    onOpenMcpServers: vi.fn(),
    onRevealSkill: vi.fn(),
    onOpenSkillFile: vi.fn(),
    isRevealing: false,
    isOpeningFile: false,
    editorApps: [
      { id: 'cursor', label: 'Cursor', kind: 'editor' },
      { id: 'finder', label: 'Finder', kind: 'file-manager' },
    ],
    editorAppsLoading: false,
    onOpenInEditor: vi.fn(),
    ...overrides,
  }

  return {
    props,
    ...render(
      <TooltipProvider>
        <SkillsBrowserDialog {...props} />
      </TooltipProvider>,
    ),
  }
}

describe('SkillsBrowserDialog', () => {
  it('renders skill groups and selected skill details', () => {
    renderDialog()

    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getAllByText('Codex')).not.toHaveLength(0)
    expect(screen.getAllByText('Review')).not.toHaveLength(0)
    expect(screen.getAllByText('/tmp/review/SKILL.md')).not.toHaveLength(0)
    expect(screen.getByText(/github/)).toBeInTheDocument()
    expect(screen.getAllByText('Declared')).not.toHaveLength(0)
    expect(screen.getByText('script: scripts/run.sh')).toBeInTheDocument()
    expect(screen.getByText('Review Skill')).toBeInTheDocument()
    expect(screen.getByText('$review')).toBeInTheDocument()
  })

  it('surfaces provider and details errors', () => {
    renderDialog({
      groups: [
        {
          providerId: 'codex',
          providerName: 'Codex',
          catalogSource: 'native-rpc',
          invocationSupport: 'structured-input',
          activationConfirmation: 'none',
          error: 'Codex unavailable.',
          skills: [],
        },
      ],
      selectedDetails: null,
      detailsError: 'Skill not found in provider catalog',
    })

    expect(screen.getByText('Codex unavailable.')).toBeInTheDocument()
    expect(
      screen.getByText('Skill not found in provider catalog'),
    ).toBeInTheDocument()
  })

  it('emits filter changes from the search field', () => {
    const onFiltersChange = vi.fn()
    renderDialog({ onFiltersChange })

    fireEvent.change(screen.getByPlaceholderText('Search skills'), {
      target: { value: 'review' },
    })

    expect(onFiltersChange).toHaveBeenCalledWith({ query: 'review' })
  })

  it('emits dependency filter changes and opens MCP visibility', () => {
    const onFiltersChange = vi.fn()
    const onOpenMcpServers = vi.fn()
    renderDialog({ onFiltersChange, onOpenMcpServers })

    selectOption(/Dependency/i, 'Declared')
    fireEvent.click(screen.getByRole('button', { name: /MCP Servers/i }))

    expect(onFiltersChange).toHaveBeenCalledWith({
      dependencyState: 'declared',
    })
    expect(onOpenMcpServers).toHaveBeenCalledTimes(1)
  })

  it('switches view modes via the view switcher', () => {
    const onViewModeChange = vi.fn()
    renderDialog({ onViewModeChange })

    fireEvent.click(screen.getByRole('button', { name: /Grid/i }))
    expect(onViewModeChange).toHaveBeenCalledWith('grid')
  })

  it('hides the filter toolbar and shows the dashboard in overview mode', () => {
    renderDialog({ viewMode: 'overview' })

    expect(screen.queryByPlaceholderText('Search skills')).toBeNull()
    expect(screen.getByText('By origin')).toBeInTheDocument()
    expect(screen.getByText('By provider')).toBeInTheDocument()
    expect(screen.getByText('Total skills')).toBeInTheDocument()
  })

  it('drills from a Needs-attention card into a precise warning filter', () => {
    const onJumpToGrid = vi.fn()
    renderDialog({ viewMode: 'overview', onJumpToGrid })

    fireEvent.click(screen.getByRole('button', { name: /Duplicate names/i }))
    expect(onJumpToGrid).toHaveBeenCalledWith({ warnings: 'duplicate-name' })
  })

  it('emits reveal and open actions from the detail pane', () => {
    const onRevealSkill = vi.fn()
    const onOpenSkillFile = vi.fn()
    renderDialog({ onRevealSkill, onOpenSkillFile })

    fireEvent.click(screen.getByRole('button', { name: 'Reveal in Finder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open SKILL.md' }))

    expect(onRevealSkill).toHaveBeenCalledTimes(1)
    expect(onOpenSkillFile).toHaveBeenCalledTimes(1)
  })

  it('disables the reveal action while it is in flight', () => {
    renderDialog({ isRevealing: true })
    expect(
      screen.getByRole('button', { name: 'Reveal in Finder' }),
    ).toBeDisabled()
  })

  it('renders the open-in-editor menu trigger', () => {
    renderDialog()
    expect(
      screen.getByRole('button', { name: 'Open in editor' }),
    ).toBeInTheDocument()
  })

  it('shows which providers are still streaming in', () => {
    renderDialog({ loadingProviderNames: ['Codex'] })
    expect(screen.getByText(/Loading Codex/)).toBeInTheDocument()
  })

  it('opens a card detail slide-over in grid mode', () => {
    const onSelectSkill = vi.fn()
    renderDialog({ viewMode: 'grid', isDetailOpen: false, onSelectSkill })

    fireEvent.click(screen.getByRole('button', { name: /Review/i }))
    expect(onSelectSkill).toHaveBeenCalledWith('skill-1')
  })

  it('renders the detail slide-over and closes it from the scrim', () => {
    const onCloseDetail = vi.fn()
    renderDialog({ viewMode: 'grid', isDetailOpen: true, onCloseDetail })

    // The detail pane (only present in the slide-over here) exposes the editor menu.
    expect(
      screen.getByRole('button', { name: 'Open in editor' }),
    ).toBeInTheDocument()

    const closers = screen.getAllByRole('button', { name: 'Close details' })
    fireEvent.click(closers[0])
    expect(onCloseDetail).toHaveBeenCalled()
  })
})
