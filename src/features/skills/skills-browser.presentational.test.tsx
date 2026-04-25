import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/shared/ui/button'
import { SkillsBrowserDialog } from './skills-browser.presentational'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDetails,
} from '@/entities/skill'
import type {
  SkillBrowserFilters,
  SkillBrowserProviderGroup,
} from './skills-browser.pure'

const filters: SkillBrowserFilters = {
  query: '',
  providerId: 'all',
  scope: 'all',
  enabled: 'all',
  warnings: 'all',
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
    groups,
    selectedSkill: skill,
    selectedDetails: details,
    isCatalogLoading: false,
    catalogError: null,
    isDetailsLoading: false,
    detailsError: null,
    filters,
    providerOptions: [{ id: 'codex', label: 'Codex' }],
    scopeOptions: ['user'],
    totalSkillCount: 1,
    filteredSkillCount: 1,
    onFiltersChange: vi.fn(),
    onSelectSkill: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  }

  return {
    props,
    ...render(<SkillsBrowserDialog {...props} />),
  }
}

describe('SkillsBrowserDialog', () => {
  it('renders skill groups and selected skill details', () => {
    renderDialog()

    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getAllByText('Codex')).not.toHaveLength(0)
    expect(screen.getAllByText('Review')).not.toHaveLength(0)
    expect(screen.getAllByText('/tmp/review/SKILL.md')).not.toHaveLength(0)
    expect(screen.getByText('mcp: github')).toBeInTheDocument()
    expect(screen.getByText('script: scripts/run.sh')).toBeInTheDocument()
    expect(screen.getByText('Review Skill')).toBeInTheDocument()
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
})
