import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import type { SkillCatalogEntry } from '@/entities/skill'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { SkillPicker } from './skill-picker.presentational'

const skill = (
  overrides: Partial<SkillCatalogEntry> &
    Pick<SkillCatalogEntry, 'id' | 'name'>,
): SkillCatalogEntry => ({
  providerId: 'claude-code',
  path: `/Users/me/.claude/skills/${overrides.name}/SKILL.md`,
  scope: 'user',
  rawScope: 'user',
  providerName: 'Claude Code',
  displayName: overrides.name,
  description: '',
  shortDescription: null,
  sourceLabel: 'User',
  enabled: true,
  dependencies: [],
  warnings: [],
  ...overrides,
})

const skills: SkillCatalogEntry[] = [
  skill({
    id: 'skill-diagnose',
    name: 'diagnose',
    shortDescription: 'Reproduce, minimise, hypothesise, instrument, fix.',
  }),
  skill({
    id: 'skill-tdd',
    name: 'tdd',
    description: 'Red, green, refactor in small steps.',
    sourceLabel: 'Project',
    warnings: [{ code: 'duplicate-name', message: 'Also defined globally.' }],
  }),
  skill({ id: 'skill-old', name: 'legacy-deploy', enabled: false }),
]

/** The picker as the composer holds it: its open state and query live outside it. */
function HeldPicker(props: ComponentProps<typeof SkillPicker>) {
  const [open, setOpen] = useState(props.open)
  const [query, setQuery] = useState(props.query)
  return (
    <SkillPicker
      {...props}
      open={open}
      query={query}
      onOpenChange={(next) => {
        setOpen(next)
        props.onOpenChange(next)
      }}
      onQueryChange={(next) => {
        setQuery(next)
        props.onQueryChange(next)
      }}
    />
  )
}

const meta = {
  title: 'Features/Composer/SkillPicker',
  component: SkillPicker,
  args: {
    open: false,
    onOpenChange: fn(),
    query: '',
    onQueryChange: fn(),
    skills,
    selectedSkills: [
      {
        id: 'skill-diagnose',
        providerId: 'claude-code',
        name: 'diagnose',
        path: '/Users/me/.claude/skills/diagnose/SKILL.md',
        scope: 'user',
        rawScope: 'user',
        providerName: 'Claude Code',
        displayName: 'diagnose',
        sourceLabel: 'User',
        status: 'selected',
      },
    ],
    activeProviderLabel: 'Claude Code',
    isLoading: false,
    error: null,
    notice: null,
    onToggleSkill: fn(),
    onBrowseAll: fn(),
  },
  render: (args) => <HeldPicker {...args} />,
} satisfies Meta<typeof SkillPicker>

export default meta

type Story = StoryObj<typeof meta>

/** The provider's skills: search, pick, or browse them all. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Select skills' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toBeVisible())
    await userEvent.type(screen.getByPlaceholderText('Search skills'), 'td')
    await expect(args.onQueryChange).toHaveBeenLastCalledWith('td')
    await expect(
      screen.getByRole('button', { name: /legacy-deploy/ }),
    ).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /^tdd/ }))
    await expect(args.onToggleSkill).toHaveBeenCalledWith(skills[1])
    await userEvent.click(screen.getByRole('button', { name: 'Browse all' }))
    await expect(args.onBrowseAll).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), {
      timeout: 3000,
    })
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
  },
}

/** Reading the catalog. */
export const Busy: Story = {
  args: { open: true, skills: [], isLoading: true },
  play: async () => {
    const shown = await screen.findByText(
      'Loading skills…',
      {},
      { timeout: 2000 },
    )
    await waitFor(() => expect(shown).toBeVisible())
  },
}

/** The catalog could not be read. */
export const Failed: Story = {
  args: {
    open: true,
    skills: [],
    error: 'claude: skills listing timed out after 10s',
  },
  play: async () => {
    const shown = await screen.findByText(/timed out after 10s/)
    await waitFor(() => expect(shown).toBeVisible())
  },
}

/** Nothing for this provider. */
export const Empty: Story = {
  args: { open: true, skills: [], selectedSkills: [] },
  play: async () => {
    const shown = await screen.findByText('No skills available for this agent')
    await waitFor(() => expect(shown).toBeVisible())
  },
}

/** A search that matches none of them. */
export const NoMatch: Story = {
  args: { open: true, skills: [], selectedSkills: [], query: 'lint' },
  play: async () => {
    const shown = await screen.findByText('No matching skills')
    await waitFor(() => expect(shown).toBeVisible())
  },
}

/** Read for another machine: the list says so. */
export const Remote: Story = {
  args: {
    open: true,
    notice: 'Skills on grok-mac, read when this session started.',
  },
  play: async () => {
    const shown = await screen.findByText(
      'Skills on grok-mac, read when this session started.',
    )
    await waitFor(() => expect(shown).toBeVisible())
  },
}

/** No provider chosen yet. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Select skills' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
