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
      listId="skills"
      items={[skill]}
      selectedSkills={[]}
      highlightedIndex={0}
      activeProviderLabel="Claude Code"
      isLoading={false}
      error={null}
      notice={NOTE}
      onSelect={onSelect}
      onHover={() => {}}
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

  it('shows the note while skills are loading', async () => {
    renderPicker({ isLoading: true, items: [] })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(
      await screen.findByText('Loading skills…', {}, { timeout: 2000 }),
    ).toBeInTheDocument()
  })

  it('shows the note when no skills match', () => {
    renderPicker({ items: [], query: 'lint' })

    expect(screen.getByTestId('remote-skills-notice')).toHaveTextContent(NOTE)
    expect(screen.getByText('No matching skills')).toBeInTheDocument()
  })

  it('says the agent has none, not that nothing matches, before a search (CONV-10)', () => {
    renderPicker({ items: [] })

    expect(
      screen.getByText('No skills available for this agent'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No matching skills')).toBeNull()
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
