import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/shared/ui/button'
import type {
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryEntry,
} from '@/entities/prompt-library'
import { PromptLibraryBrowserDialog } from './prompt-library-browser.presentational'
import type { PromptLibraryBrowserFilters } from './prompt-library-browser.pure'

const filters: PromptLibraryBrowserFilters = {
  query: '',
  scope: 'all',
  kind: 'all',
  tag: 'all',
}

const prompt: PromptLibraryEntry = {
  id: 'prompt-1',
  title: 'Review PR',
  description: 'Review pull requests.',
  shortDescription: 'Review PRs',
  path: '/tmp/prompts/review-pr.md',
  relativePath: 'review-pr.md',
  scope: 'project',
  sourceLabel: 'Project',
  kind: 'markdown',
  tags: ['review', 'github'],
  sizeBytes: 42,
}

const catalog: PromptLibraryCatalog = {
  projectId: 'project-1',
  projectName: 'convergence',
  refreshedAt: '2026-05-13T00:00:00.000Z',
  roots: [],
  prompts: [prompt],
}

const details: PromptLibraryDetails = {
  promptId: prompt.id,
  path: prompt.path,
  markdown: '# Review PR\n\nReview this pull request.',
  promptText: 'Review this pull request.',
  sizeBytes: 42,
}

function renderDialog(
  overrides: Partial<Parameters<typeof PromptLibraryBrowserDialog>[0]> = {},
) {
  const props: Parameters<typeof PromptLibraryBrowserDialog>[0] = {
    open: true,
    onOpenChange: vi.fn(),
    trigger: <Button type="button">Open</Button>,
    projectName: 'convergence',
    catalog,
    prompts: [prompt],
    selectedPrompt: prompt,
    selectedDetails: details,
    isCatalogLoading: false,
    catalogError: null,
    isDetailsLoading: false,
    detailsError: null,
    filters,
    tagOptions: ['review', 'github'],
    totalPromptCount: 1,
    filteredPromptCount: 1,
    onFiltersChange: vi.fn(),
    onSelectPrompt: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  }

  return {
    props,
    ...render(<PromptLibraryBrowserDialog {...props} />),
  }
}

describe('PromptLibraryBrowserDialog', () => {
  it('renders prompt rows and selected prompt details', () => {
    renderDialog()

    expect(screen.getByText('Prompt Library')).toBeInTheDocument()
    expect(screen.getAllByText('Review PR')).not.toHaveLength(0)
    expect(screen.getByText('Review pull requests.')).toBeInTheDocument()
    expect(screen.getAllByText('Project')).not.toHaveLength(0)
    expect(screen.getAllByText('Markdown')).not.toHaveLength(0)
    expect(screen.getAllByText('review')).not.toHaveLength(0)
    expect(screen.getAllByText('/tmp/prompts/review-pr.md')).not.toHaveLength(0)
    expect(screen.getAllByText('Review this pull request.')).toHaveLength(2)
  })

  it('surfaces catalog and details errors', () => {
    renderDialog({
      catalog: null,
      prompts: [],
      selectedDetails: null,
      catalogError: 'Prompt scan failed.',
      detailsError: 'Prompt not found in library',
    })

    expect(screen.getByText('Prompt scan failed.')).toBeInTheDocument()
    expect(screen.getByText('Prompt not found in library')).toBeInTheDocument()
  })

  it('emits filter changes from controls', () => {
    const onFiltersChange = vi.fn()
    renderDialog({ onFiltersChange })

    fireEvent.change(screen.getByPlaceholderText('Search prompts'), {
      target: { value: 'review' },
    })
    fireEvent.change(screen.getByLabelText(/Scope/i), {
      target: { value: 'project' },
    })
    fireEvent.change(screen.getByLabelText(/Tag/i), {
      target: { value: 'github' },
    })

    expect(onFiltersChange).toHaveBeenCalledWith({ query: 'review' })
    expect(onFiltersChange).toHaveBeenCalledWith({ scope: 'project' })
    expect(onFiltersChange).toHaveBeenCalledWith({ tag: 'github' })
  })
})
