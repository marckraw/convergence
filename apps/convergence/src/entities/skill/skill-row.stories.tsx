import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import type { SkillCatalogEntry } from './skill.types'
import { SkillRow } from './skill-row.presentational'

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

const diagnose = skill({
  id: 'skill-diagnose',
  name: 'diagnose',
  shortDescription: 'Reproduce, minimise, hypothesise, instrument, fix.',
})

/** A row's frame belongs to its list; the stories give it a plain one. */
const frame = (form: 'full' | 'compact') =>
  form === 'full'
    ? 'flex w-96 rounded-lg px-3 py-2 text-left'
    : 'flex w-80 flex-col items-start rounded px-2 py-1.5 text-xs'

const meta = {
  title: 'Entities/Skill/Skill row',
  component: SkillRow,
  args: { skill: diagnose, selected: false, form: 'full' },
  render: (args) => (
    <div className={frame(args.form)}>
      <SkillRow {...args} />
    </div>
  ),
} satisfies Meta<typeof SkillRow>

export default meta

type Story = StoryObj<typeof meta>

/** The Add popover's row: the name, its description and its tags. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('diagnose')).toBeVisible()
    await expect(
      canvas.getByText('Reproduce, minimise, hypothesise, instrument, fix.'),
    ).toBeVisible()
    await expect(canvas.getByText('User')).toBeVisible()
    await expect(canvas.getByText('Claude Code')).toBeVisible()
  },
}

/** The `::skill::` picker's row, added already: a check, and "(added)" for a screen reader. */
export const Compact: Story = {
  args: { form: 'compact', selected: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('(added)')).toBeInTheDocument()
    await expect(canvas.queryByText('User')).toBeNull()
  },
}

/** Disabled in the provider's settings, with warnings about it. */
export const Disabled: Story = {
  args: {
    skill: skill({
      id: 'skill-old',
      name: 'legacy-deploy',
      enabled: false,
      warnings: [{ code: 'duplicate-name', message: 'Also defined globally.' }],
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Disabled')).toBeVisible()
    await expect(canvas.getByText('No description.')).toBeVisible()
  },
}

/** A long name and description are cut short, never wider than the list. */
export const Long: Story = {
  args: {
    skill: skill({
      id: 'skill-long',
      name: 'reproduce-minimise-hypothesise-instrument-fix-and-regression-test',
      description:
        'A disciplined diagnosis loop for hard bugs and performance regressions: reproduce, minimise, hypothesise, instrument, fix, then write the regression test that would have caught it.',
    }),
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
