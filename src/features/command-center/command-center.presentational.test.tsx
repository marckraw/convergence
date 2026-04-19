import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommandCenterPalette } from './command-center.presentational'
import type {
  CuratedSection,
  DialogPaletteItem,
  PaletteItem,
  ProjectPaletteItem,
  RankedItem,
  SessionPaletteItem,
} from './command-center.types'

const project: ProjectPaletteItem = {
  kind: 'project',
  id: 'project:p1',
  projectId: 'p1',
  projectName: 'alpha',
  repositoryPath: '/repos/alpha',
  search: { projectName: 'alpha' },
}

const session: SessionPaletteItem = {
  kind: 'session',
  id: 'session:s1',
  sessionId: 's1',
  projectId: 'p1',
  workspaceId: 'w1',
  sessionName: 'fix login bug',
  projectName: 'alpha',
  branchName: 'feat/login',
  providerId: 'claude-code',
  attention: 'none',
  updatedAt: '2026-04-01T00:00:00.000Z',
  search: {
    sessionName: 'fix login bug',
    projectName: 'alpha',
    branchName: 'feat/login',
    providerId: 'claude-code',
  },
}

const dialog: DialogPaletteItem = {
  kind: 'dialog',
  id: 'dialog:providers',
  dialogKind: 'providers',
  title: 'Providers',
  description: 'Configure provider credentials',
  search: { title: 'Providers' },
}

describe('CommandCenterPalette', () => {
  it('returns nothing visible when closed', () => {
    const { queryByRole } = render(
      <CommandCenterPalette
        open={false}
        query=""
        view={{ mode: 'sections', sections: [] }}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(queryByRole('dialog')).toBeNull()
  })

  it('renders curated section headings and items', () => {
    const sections: CuratedSection[] = [
      {
        id: 'projects',
        title: 'Projects',
        items: [project],
      },
      {
        id: 'dialogs',
        title: 'Dialogs',
        items: [dialog],
      },
    ]

    render(
      <CommandCenterPalette
        open
        query=""
        view={{ mode: 'sections', sections }}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Dialogs')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('Providers')).toBeInTheDocument()
  })

  it('hides empty sections from the sections view', () => {
    const sections: CuratedSection[] = [
      { id: 'waiting-on-you', title: 'Waiting on You', items: [] },
      { id: 'projects', title: 'Projects', items: [project] },
    ]

    render(
      <CommandCenterPalette
        open
        query=""
        view={{ mode: 'sections', sections }}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        onSelect={() => {}}
      />,
    )

    expect(screen.queryByText('Waiting on You')).toBeNull()
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('renders ranked items without section headers', () => {
    const items: RankedItem[] = [
      { item: session, score: 0.1 },
      { item: project, score: 0.3 },
    ]

    render(
      <CommandCenterPalette
        open
        query="alpha"
        view={{ mode: 'ranked', items }}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        onSelect={() => {}}
      />,
    )

    expect(screen.queryByText('Projects')).toBeNull()
    expect(screen.getByText('fix login bug')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
  })

  it('shows a hint when ranked view has no hits', () => {
    render(
      <CommandCenterPalette
        open
        query="nope"
        view={{ mode: 'ranked', items: [] }}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        onSelect={() => {}}
      />,
    )

    expect(
      screen.getByText(/Try a session name, branch, or project/i),
    ).toBeInTheDocument()
  })

  it('forwards input changes via onQueryChange', () => {
    const onQueryChange = vi.fn<(query: string) => void>()

    render(
      <CommandCenterPalette
        open
        query=""
        view={{ mode: 'sections', sections: [] }}
        onOpenChange={() => {}}
        onQueryChange={onQueryChange}
        onSelect={() => {}}
      />,
    )

    const input = screen.getByPlaceholderText(/Search projects/i)
    fireEvent.change(input, { target: { value: 'a' } })

    expect(onQueryChange).toHaveBeenCalledWith('a')
  })

  it('fires onSelect with the full palette item when a row is chosen', () => {
    const onSelect = vi.fn<(item: PaletteItem) => void>()

    render(
      <CommandCenterPalette
        open
        query=""
        view={{
          mode: 'sections',
          sections: [{ id: 'projects', title: 'Projects', items: [project] }],
        }}
        onOpenChange={() => {}}
        onQueryChange={() => {}}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByText('alpha'))

    expect(onSelect).toHaveBeenCalledWith(project)
  })
})
