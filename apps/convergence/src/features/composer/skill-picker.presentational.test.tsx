import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SkillCatalogEntry } from '@/entities/skill'
import { SkillPicker } from './skill-picker.presentational'

const NOTE = 'From this Mac — little-monster may not have these skills.'

const skill: SkillCatalogEntry = {
  id: 'claude-code:global:planning',
  providerId: 'claude-code',
  providerName: 'Claude Code',
  name: 'planning',
  displayName: 'Planning',
  description: 'Plan implementation work.',
  shortDescription: 'Plan implementation work.',
  path: '/skills/planning/SKILL.md',
  scope: 'global',
  rawScope: null,
  sourceLabel: 'Global',
  enabled: true,
  dependencies: [],
  warnings: [],
}

function renderPicker(
  overrides: Partial<ComponentProps<typeof SkillPicker>> = {},
) {
  const onToggleSkill = vi.fn()
  render(
    <SkillPicker
      open
      onOpenChange={() => {}}
      query=""
      onQueryChange={() => {}}
      skills={[skill]}
      selectedSkills={[]}
      activeProviderLabel="Claude Code"
      isLoading={false}
      error={null}
      notice={NOTE}
      onToggleSkill={onToggleSkill}
      onBrowseAll={() => {}}
      {...overrides}
    />,
  )
  return { onToggleSkill }
}

describe('SkillPicker remote skills note', () => {
  it('shows the note above a listed skill, and the skill stays selectable', () => {
    const { onToggleSkill } = renderPicker()

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    fireEvent.click(screen.getByRole('button', { name: /Planning/ }))
    expect(onToggleSkill).toHaveBeenCalledWith(skill)
  })

  it('shows the note while skills are loading', () => {
    renderPicker({ isLoading: true, skills: [] })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(screen.getByText('Loading skills...')).toBeInTheDocument()
  })

  it('shows the note when no skills match', () => {
    renderPicker({ skills: [] })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(
      screen.getByText('No skills matched this provider.'),
    ).toBeInTheDocument()
  })

  it('shows the note above an error', () => {
    renderPicker({ error: 'Could not read skills.', skills: [] })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(screen.getByText('Could not read skills.')).toBeInTheDocument()
  })

  it('shows no note on this Mac', () => {
    renderPicker({ notice: null })

    expect(screen.queryByTestId('remote-skills-notice')).toBeNull()
    expect(screen.getByRole('button', { name: /Planning/ })).toBeInTheDocument()
  })
})
