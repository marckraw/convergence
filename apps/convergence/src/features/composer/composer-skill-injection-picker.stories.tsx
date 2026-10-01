import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SkillCatalogEntry } from '@/entities/skill'
import { expect, fn, waitFor } from 'storybook/test'
import { ComposerSkillInjectionPicker } from './composer-skill-injection-picker.presentational'

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
    warnings: [{ code: 'duplicate-name', message: 'Also defined in project.' }],
  }),
  skill({ id: 'skill-old', name: 'legacy-deploy', enabled: false }),
]

const meta = {
  title: 'Features/Composer/ComposerSkillInjectionPicker',
  component: ComposerSkillInjectionPicker,
  args: {
    open: true,
    listId: 'skills',
    items: skills,
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
    highlightedIndex: 1,
    activeProviderLabel: 'Claude Code',
    isLoading: false,
    error: null,
    notice: null,
    onSelect: fn(),
    onHover: fn(),
    onDismiss: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="relative mt-72 w-144 max-w-full rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
        <Story />
        ::skill::
      </div>
    ),
  ],
} satisfies Meta<typeof ComposerSkillInjectionPicker>

export default meta

type Story = StoryObj<typeof meta>

/** The provider's skills under ::skill::; a disabled one cannot be picked. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    // A named list that holds only its options (MAR-3616 DS3e).
    await expect(canvas.getByRole('listbox')).toHaveAccessibleName('Skills')
    await expect(canvas.getByRole('option', { name: /tdd/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // A listbox row is never a disabled button now: it says so with
    // aria-disabled, and a click passes it by.
    const legacy = canvas.getByRole('option', { name: /legacy-deploy/ })
    await expect(legacy).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(legacy)
    await expect(args.onSelect).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('option', { name: /tdd/ }))
    await expect(args.onSelect).toHaveBeenCalledWith(skills[1])
  },
}

/** Read for another machine: the list says so above itself. */
export const Remote: Story = {
  args: { notice: 'Skills on grok-mac, read when this session started.' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Skills on grok-mac, read when this session started.'),
    ).toBeVisible()
  },
}

/** Reading the catalog. */
export const Busy: Story = {
  args: { items: [], isLoading: true },
  play: async ({ canvas }) => {
    const words = await canvas.findByText('Loading skills…')
    await waitFor(() => expect(words).toBeVisible())
  },
}

/** The catalog could not be read. */
export const Failed: Story = {
  args: { items: [], error: 'claude: skills listing timed out after 10s' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/timed out after 10s/)).toBeVisible()
  },
}

/** Nothing matches. */
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No matching skills')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
