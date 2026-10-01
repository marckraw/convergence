import type { Meta, StoryObj } from '@storybook/react-vite'
import type { SkillCatalogEntry } from '@/entities/skill'
import { expect, fn } from 'storybook/test'
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

const knownListboxIssues = {
  a11y: {
    config: {
      rules: [
        // a11y-known: the picker's listbox has no accessible name — fixed by the sweep (DS4)
        { id: 'aria-input-field-name', enabled: false },
        // a11y-known: the listbox also holds its heading, its visually hidden Close button and its messages, which are not options — fixed by the sweep (DS4)
        { id: 'aria-required-children', enabled: false },
      ],
    },
  },
}

const meta = {
  title: 'Features/Composer/ComposerSkillInjectionPicker',
  component: ComposerSkillInjectionPicker,
  args: {
    open: true,
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
      <div className="relative mt-72 w-[36rem] max-w-full rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
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
  parameters: knownListboxIssues,
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('option', { name: /tdd/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(
      canvas.getByRole('option', { name: /legacy-deploy/ }),
    ).toBeDisabled()
    await userEvent.click(canvas.getByRole('option', { name: /tdd/ }))
    await expect(args.onSelect).toHaveBeenCalledWith(skills[1])
  },
}

/** Read for another machine: the list says so above itself. */
export const Remote: Story = {
  parameters: knownListboxIssues,
  args: { notice: 'Skills on grok-mac, read when this session started.' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Skills on grok-mac, read when this session started.'),
    ).toBeVisible()
  },
}

/** Reading the catalog. */
export const Busy: Story = {
  parameters: knownListboxIssues,
  args: { items: [], isLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Loading skills...')).toBeVisible()
  },
}

/** The catalog could not be read. */
export const Failed: Story = {
  parameters: knownListboxIssues,
  args: { items: [], error: 'claude: skills listing timed out after 10s' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/timed out after 10s/)).toBeVisible()
  },
}

/** Nothing matches. */
export const Empty: Story = {
  parameters: knownListboxIssues,
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No matching skills.')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  parameters: {
    a11y: {
      config: {
        rules: [
          ...knownListboxIssues.a11y.config.rules,
          // a11y-known: in dark, a selected skill's description (muted on the primary tint) is 4.16:1 — fixed by the sweep (DS4)
          { id: 'color-contrast', enabled: false },
        ],
      },
    },
  },
  globals: { theme: 'dark' },
}
