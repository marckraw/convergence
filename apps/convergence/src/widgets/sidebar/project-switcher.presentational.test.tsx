import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, type Project } from '@/entities/project'
import { ProjectSwitcher } from './project-switcher.presentational'

function project(
  id: string,
  name: string,
  laneOf: string | null = null,
  laneName: string | null = null,
): Project {
  return {
    id,
    name,
    repositoryPath: `/repos/${id}`,
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    laneOf,
    laneName,
  }
}

/**
 * The lane's place in the sidebar, rendered (MAR-2783, ruling 5): under its
 * root, one level in, with a `lane` badge -- asked of the DOM rather than of
 * the item list, because the list's order and depth only mean anything once
 * the popover has laid them out.
 */
describe('ProjectSwitcher with lanes', () => {
  it('renders a lane nested under its root with a lane badge', async () => {
    render(
      <ProjectSwitcher
        projects={[
          project('other', 'other'),
          project('lane-1', 'convergence · lane: studio', 'root', 'studio'),
          project('root', 'convergence'),
        ]}
        activeProjectId="root"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox'))

    const options = await screen.findAllByRole('option')
    const labels = options.map(
      (option) => option.querySelector('.font-medium')?.textContent,
    )
    // Roots keep their order; the lane follows ITS root, not the first one.
    expect(labels).toEqual(['other', 'convergence', 'studio'])

    const laneOption = options[2]!
    expect(laneOption).toHaveAttribute('data-depth', '1')
    expect(laneOption).toHaveTextContent('lane')
    expect(options[1]).toHaveAttribute('data-depth', '0')
    expect(options[1]).not.toHaveTextContent('lane')
  })

  it('selects a lane as a project', async () => {
    const onSelectProject = vi.fn()
    render(
      <ProjectSwitcher
        projects={[
          project('root', 'convergence'),
          project('lane-1', 'convergence · lane: studio', 'root', 'studio'),
        ]}
        activeProjectId="root"
        onSelectProject={onSelectProject}
        onCreateProject={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByText('studio'))

    expect(onSelectProject).toHaveBeenCalledWith('lane-1')
  })
})
