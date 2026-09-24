import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SkillCatalogEntry } from '@/entities/skill'
import { ComposerSkillInjectionPicker } from './composer-skill-injection-picker.presentational'

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
  overrides: Partial<ComponentProps<typeof ComposerSkillInjectionPicker>> = {},
) {
  const onSelect = vi.fn()
  render(
    <ComposerSkillInjectionPicker
      open
      items={[skill]}
      selectedSkills={[]}
      highlightedIndex={0}
      activeProviderLabel="Claude Code"
      isLoading={false}
      error={null}
      notice={NOTE}
      onSelect={onSelect}
      onHover={() => {}}
      onDismiss={() => {}}
      {...overrides}
    />,
  )
  return { onSelect }
}

describe('ComposerSkillInjectionPicker remote skills note', () => {
  it('shows the note above a listed skill, and the skill stays selectable', () => {
    const { onSelect } = renderPicker()

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    fireEvent.click(screen.getByRole('option', { name: /Planning/ }))
    expect(onSelect).toHaveBeenCalledWith(skill)
  })

  it('shows the note while skills are loading', () => {
    renderPicker({ isLoading: true, items: [] })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(screen.getByText('Loading skills...')).toBeInTheDocument()
  })

  it('shows the note when no skills match', () => {
    renderPicker({ items: [] })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(screen.getByText('No matching skills.')).toBeInTheDocument()
  })

  it('shows the note above an error', () => {
    renderPicker({ error: 'Could not read skills.', items: [] })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(screen.getByText('Could not read skills.')).toBeInTheDocument()
  })

  it('shows no note on this Mac', () => {
    renderPicker({ notice: null })

    expect(screen.queryByTestId('remote-skills-notice')).toBeNull()
    expect(screen.getByRole('option', { name: /Planning/ })).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    renderPicker({ open: false })

    expect(screen.queryByTestId('remote-skills-notice')).toBeNull()
  })
})
