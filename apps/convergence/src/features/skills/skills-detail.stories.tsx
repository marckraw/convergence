import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { TooltipProvider } from '@convergence/ui'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDetails,
} from '@/entities/skill'
import { SkillDetailPane } from './skills-detail.presentational'

const skill: SkillCatalogEntry = {
  id: 'codex:mrck-ship-it',
  providerId: 'codex',
  providerName: 'Codex',
  name: 'mrck-ship-it',
  displayName: 'mrck-ship-it',
  description:
    'Commit changes with meaningful messages, create changesets if needed, push, and open a pull request to the base branch.',
  shortDescription: null,
  sourceLabel: '~/.codex/skills',
  enabled: true,
  scope: 'project',
  rawScope: 'repo',
  path: '/Users/marcin/Projects/convergence/.codex/skills/mrck-ship-it/SKILL.md',
  dependencies: [
    { kind: 'mcp', name: 'github', state: 'needs-auth' },
    { kind: 'tool', name: 'gh', state: 'available' },
  ],
  warnings: [
    {
      code: 'duplicate-name',
      message: 'Claude Code has a skill with the same name.',
    },
  ],
}

const catalog: ProjectSkillCatalog = {
  projectId: 'project-convergence',
  projectName: 'convergence',
  refreshedAt: '2026-10-01T12:00:00.000Z',
  providers: [
    {
      providerId: 'codex',
      providerName: 'Codex',
      catalogSource: 'native-rpc',
      invocationSupport: 'structured-input',
      activationConfirmation: 'native-event',
      skills: [skill],
      error: null,
    },
  ],
}

const details: SkillDetails = {
  skillId: skill.id,
  providerId: 'codex',
  path: skill.path ?? '',
  markdown:
    '# Ship it\n\n1. Commit with meaningful messages.\n2. Add a changeset when the change is user-facing.\n3. Push and open a pull request.',
  sizeBytes: 1284,
  resources: [
    { kind: 'script', name: 'pr.sh', relativePath: 'scripts/pr.sh' },
    {
      kind: 'reference',
      name: 'changesets.md',
      relativePath: 'references/changesets.md',
    },
  ],
}

const meta = {
  title: 'Features/Skills/SkillDetailPane',
  component: SkillDetailPane,
  args: {
    projectName: 'convergence',
    catalog,
    selectedSkill: skill,
    selectedDetails: details,
    isDetailsLoading: false,
    detailsError: null,
    onOpenMcpServers: fn(),
    onReveal: fn(),
    onOpenFile: fn(),
    isRevealing: false,
    isOpeningFile: false,
    editorApps: [
      { id: 'zed', label: 'Zed', kind: 'editor' },
      { id: 'finder', label: 'Finder', kind: 'file-manager' },
    ],
    editorAppsLoading: false,
    onOpenInEditor: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="h-160 w-180 rounded-lg border border-line">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SkillDetailPane>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A skill: its provider, path, dependencies and warnings, its SKILL.md, and
 * the actions on its file.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: 'mrck-ship-it' }),
    ).toBeVisible()
    await expect(canvas.getByText('$mrck-ship-it')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'MCP servers' }))
    await expect(args.onOpenMcpServers).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Reveal in Finder' }),
    )
    await expect(args.onReveal).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Open SKILL.md' }))
    await expect(args.onOpenFile).toHaveBeenCalledOnce()
  },
}

/** The Open menu lists the editors found, and opens the folder in one. */
export const OpenInEditor: Story = {
  name: 'Open in editor',
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open in editor' }),
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Open in Zed' }),
    )
    await expect(args.onOpenInEditor).toHaveBeenCalledWith('zed')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** The Copy menu offers the name, the path and the invocation. */
export const CopyMenu: Story = {
  name: 'Copy menu',
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }))
    await screen.findByRole('menu')
    await expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Copy name', 'Copy SKILL.md path', 'Copy invocation'])
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** Busy: the details are loading, and Reveal is in flight. */
export const Busy: Story = {
  args: {
    selectedDetails: null,
    isDetailsLoading: true,
    isRevealing: true,
    editorAppsLoading: true,
  },
  play: async ({ canvas, userEvent }) => {
    await waitFor(() =>
      expect(canvas.getByText('Loading the skill’s details…')).toBeVisible(),
    )
    await expect(
      canvas.getByRole('button', { name: 'Reveal in Finder' }),
    ).toBeDisabled()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open in editor' }),
    )
    await expect(
      await screen.findByRole('menuitem', { name: 'Detecting apps…' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** Failed: SKILL.md could not be read. */
export const Failed: Story = {
  args: {
    selectedDetails: null,
    detailsError: 'Could not read SKILL.md: ENOENT, no such file or directory.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(/ENOENT/)
  },
}

/** Empty: no skill chosen yet. */
export const Empty: Story = {
  args: { selectedSkill: null, selectedDetails: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No skill selected')).toBeVisible()
  },
}

/** Disabled: no project open. */
export const Disabled: Story = {
  args: { projectName: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Open a project to inspect skills.'),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
