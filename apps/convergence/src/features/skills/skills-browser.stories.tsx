import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { Button, TooltipProvider } from '@convergence/ui'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDetails,
} from '@/entities/skill'
import {
  filterSkillCatalog,
  groupSkillsForGrid,
  type SkillBrowserFilters,
} from './skills-browser.pure'
import { buildSkillsOverview } from './skills-overview.pure'
import { SkillsBrowserDialog } from './skills-browser.presentational'

const skill = (
  fields: Pick<SkillCatalogEntry, 'providerId' | 'name' | 'scope'> &
    Partial<SkillCatalogEntry>,
): SkillCatalogEntry => ({
  id: `${fields.providerId}:${fields.name}`,
  providerName: fields.providerId === 'codex' ? 'Codex' : 'Claude Code',
  displayName: fields.name,
  description: `Use when the work calls for ${fields.name}.`,
  shortDescription: null,
  sourceLabel: fields.scope === 'project' ? '.claude/skills' : '~/.claude',
  enabled: true,
  dependencies: [],
  warnings: [],
  path: `/Users/marcin/.claude/skills/${fields.name}/SKILL.md`,
  rawScope: fields.scope,
  ...fields,
})

const shipIt = skill({
  providerId: 'claude-code',
  name: 'mrck-ship-it',
  scope: 'user',
  description:
    'Commit changes with meaningful messages, create changesets if needed, push, and open a pull request to the base branch.',
  dependencies: [{ kind: 'mcp', name: 'github', state: 'available' }],
})

const catalog: ProjectSkillCatalog = {
  projectId: 'project-convergence',
  projectName: 'convergence',
  refreshedAt: '2026-10-01T12:00:00.000Z',
  providers: [
    {
      providerId: 'claude-code',
      providerName: 'Claude Code',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      error: null,
      skills: [
        shipIt,
        skill({
          providerId: 'claude-code',
          name: 'update-convergence-provider-models',
          scope: 'project',
          path: '/Users/marcin/Projects/convergence/.codex/skills/update-convergence-provider-models/SKILL.md',
        }),
        skill({
          providerId: 'claude-code',
          name: 'figma-use',
          scope: 'plugin',
          dependencies: [{ kind: 'mcp', name: 'figma', state: 'needs-auth' }],
        }),
        skill({
          providerId: 'claude-code',
          name: 'tdd',
          scope: 'user',
          description: '',
          enabled: false,
          warnings: [
            {
              code: 'missing-description',
              message: 'SKILL.md has no description in its frontmatter.',
            },
          ],
        }),
      ],
    },
    {
      providerId: 'codex',
      providerName: 'Codex',
      catalogSource: 'native-rpc',
      invocationSupport: 'structured-input',
      activationConfirmation: 'native-event',
      error: null,
      skills: [
        skill({
          providerId: 'codex',
          name: 'mrck-ship-it',
          scope: 'user',
          warnings: [
            {
              code: 'duplicate-name',
              message: 'Claude Code has a skill with the same name.',
            },
          ],
        }),
      ],
    },
  ],
}

const filters: SkillBrowserFilters = {
  query: '',
  providerId: 'all',
  origin: 'all',
  scope: 'all',
  enabled: 'all',
  warnings: 'all',
  dependencyState: 'all',
}

const groups = filterSkillCatalog(catalog, filters)

const details: SkillDetails = {
  skillId: shipIt.id,
  providerId: 'claude-code',
  path: shipIt.path ?? '',
  markdown:
    '# Ship it\n\nCommit with meaningful messages, add a changeset when the change is user-facing, push, and open a pull request.',
  sizeBytes: 1284,
  resources: [{ kind: 'script', name: 'pr.sh', relativePath: 'scripts/pr.sh' }],
}

const openDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Skills' })
  await waitFor(() =>
    expect(dialog).toContainElement(document.activeElement as HTMLElement),
  )
  // Rests once its pop-in has finished, so what is checked is what is seen.
  await waitFor(() =>
    expect(
      dialog.getAnimations().filter((a) => a.playState === 'running'),
    ).toHaveLength(0),
  )
  return dialog
}

const meta = {
  title: 'Features/Skills/SkillsBrowserDialog',
  component: SkillsBrowserDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    trigger: <Button variant="ghost">Skills</Button>,
    projectName: 'convergence',
    catalog,
    viewMode: 'overview',
    groupBy: 'provider',
    groups,
    gridGroups: groupSkillsForGrid(groups, 'provider'),
    overview: buildSkillsOverview(catalog),
    selectedSkill: null,
    selectedDetails: null,
    isCatalogLoading: false,
    loadingProviderNames: [],
    catalogError: null,
    isDetailsLoading: false,
    detailsError: null,
    isDetailOpen: false,
    filters,
    providerOptions: [
      { id: 'claude-code', label: 'Claude Code' },
      { id: 'codex', label: 'Codex' },
    ],
    totalSkillCount: 5,
    filteredSkillCount: 5,
    onViewModeChange: fn(),
    onGroupByChange: fn(),
    onFiltersChange: fn(),
    onJumpToGrid: fn(),
    onSelectSkill: fn(),
    onCloseDetail: fn(),
    onRefresh: fn(),
    onOpenMcpServers: fn(),
    onRevealSkill: fn(),
    onOpenSkillFile: fn(),
    isRevealing: false,
    isOpeningFile: false,
    editorApps: [
      { id: 'cursor', label: 'Cursor', kind: 'editor' },
      { id: 'finder', label: 'Finder', kind: 'file-manager' },
    ],
    editorAppsLoading: false,
    onOpenInEditor: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SkillsBrowserDialog>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The overview: counts, the origins and providers, and what needs
 * attention, each a way into the filtered grid.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      '5/5 skills in convergence.',
    )
    // The view is a segmented choice (R9), in the header with Refresh (R6).
    await expect(
      within(dialog).getByRole('radio', { name: 'Overview' }),
    ).toBeChecked()
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Duplicate names/ }),
    )
    await expect(args.onJumpToGrid).toHaveBeenCalledWith({
      warnings: 'duplicate-name',
    })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Grid' }))
    await expect(args.onViewModeChange).toHaveBeenCalledWith('grid')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
    // A catalogue to look at and leave: no footer.
    await expect(dialog.querySelector('[data-slot="dialog-footer"]')).toBeNull()
  },
}

/** The grid, grouped by provider, with the filters above it. */
export const Grid: Story = {
  args: { viewMode: 'grid' },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await userEvent.type(
      within(dialog).getByRole('searchbox', { name: 'Search skills' }),
      's',
    )
    await expect(args.onFiltersChange).toHaveBeenCalledWith({ query: 's' })
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Status' }),
    )
    await userEvent.click(
      await screen.findByRole('option', { name: 'Disabled' }),
    )
    await expect(args.onFiltersChange).toHaveBeenCalledWith({
      enabled: 'disabled',
    })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^figma-use/ }),
    )
    await expect(args.onSelectSkill).toHaveBeenCalledWith(
      'claude-code:figma-use',
    )
  },
}

/** A skill chosen in the grid slides its details over, with a scrim to close it. */
export const GridDetail: Story = {
  name: 'Grid, details open',
  args: {
    viewMode: 'grid',
    selectedSkill: shipIt,
    selectedDetails: details,
    isDetailOpen: true,
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByRole('heading', { name: 'mrck-ship-it' }),
    ).toBeVisible()
    // The details are a Sheet over the grid since MAR-3616: a dialog of its
    // own, named for the skill, closed by its one Close (the scrim beside it
    // is no longer a second button), by Escape, or by a press beside it.
    const sheet = await screen.findByRole('dialog', {
      name: 'mrck-ship-it details',
    })
    await expect(dialog.contains(sheet)).toBe(true)
    const closers = within(sheet).getAllByRole('button', {
      name: 'Close details',
    })
    await expect(closers).toHaveLength(1)
    await userEvent.click(closers[0] as HTMLElement)
    await expect(args.onCloseDetail).toHaveBeenCalledOnce()
  },
}

/** The list beside the chosen skill's details. */
export const List: Story = {
  args: {
    viewMode: 'list',
    selectedSkill: shipIt,
    selectedDetails: details,
  },
  play: async ({ args, userEvent }) => {
    const dialog = await openDialog()
    await expect(within(dialog).getByText('SKILL.md')).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: /^update-convergence-provider-models/,
      }),
    )
    await expect(args.onSelectSkill).toHaveBeenCalledWith(
      'claude-code:update-convergence-provider-models',
    )
    await expect(within(dialog).getByText(shipIt.path ?? '')).toBeVisible()
  },
}

/** Busy: the first read, and the providers still loading. */
export const Busy: Story = {
  args: {
    catalog: null,
    isCatalogLoading: true,
    loadingProviderNames: ['Claude Code', 'Codex'],
    totalSkillCount: 0,
    filteredSkillCount: 0,
  },
  play: async () => {
    const dialog = await openDialog()
    await waitFor(() =>
      expect(within(dialog).getByText('Loading skills…')).toBeVisible(),
    )
    await expect(
      within(dialog).getByText('Loading Claude Code, Codex…'),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    ).toHaveAttribute('aria-busy', 'true')
  },
}

/** Failed: the catalog could not be read. */
export const Failed: Story = {
  args: {
    catalog: null,
    catalogError: 'Codex did not answer skills/list within 20 seconds.',
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /did not answer/,
    )
  },
}

/** Empty: no provider here can list skills. */
export const Empty: Story = {
  args: {
    catalog: { ...catalog, providers: [] },
    groups: [],
    gridGroups: [],
    overview: buildSkillsOverview({ ...catalog, providers: [] }),
    totalSkillCount: 0,
    filteredSkillCount: 0,
  },
  play: async () => {
    const dialog = await openDialog()
    await expect(
      within(dialog).getByText('No skill-capable providers'),
    ).toBeVisible()
  },
}

/** Disabled: no project open. */
export const Disabled: Story = {
  args: { projectName: null, catalog: null },
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'Select a project to browse provider skills.',
    )
    const refresh = within(dialog).getByRole('button', { name: 'Refresh' })
    await expect(refresh).toHaveAttribute('aria-disabled', 'true')
    await expect(refresh).toHaveAccessibleDescription('Open a project first.')
  },
}

export const Dark: Story = {
  ...List,
  name: 'Dark',
  globals: { theme: 'dark' },
}
