import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, within } from 'storybook/test'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@convergence/ui'
import type { ProjectOpenApp } from '@/entities/project-open'
import { ProjectOpenMenuSection } from './project-open-menu-section.presentational'

type SectionProps = ComponentProps<typeof ProjectOpenMenuSection>

const apps: ProjectOpenApp[] = [
  { id: 'cursor', label: 'Cursor', kind: 'editor' },
  { id: 'vscode', label: 'VS Code', kind: 'editor' },
  { id: 'zed', label: 'Zed', kind: 'editor' },
  { id: 'finder', label: 'Finder', kind: 'file-manager' },
]

/**
 * The section as the header's Project menu holds it: other items above, the
 * Open in group below a separator. Open from the start, and not modal, so
 * the story rests on the section itself.
 */
const InProjectMenu = (props: SectionProps) => (
  <DropdownMenu defaultOpen modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm">
        convergence
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-52">
      <DropdownMenuItem>Project settings…</DropdownMenuItem>
      <DropdownMenuSeparator />
      <ProjectOpenMenuSection {...props} />
    </DropdownMenuContent>
  </DropdownMenu>
)

const meta = {
  title: 'Features/ProjectOpenMenu/ProjectOpenMenuSection',
  component: ProjectOpenMenuSection,
  render: (args) => <InProjectMenu {...args} />,
  args: {
    apps,
    loading: false,
    disabledReason: null,
    onOpen: fn(),
  },
} satisfies Meta<typeof ProjectOpenMenuSection>

export default meta

type Story = StoryObj<typeof meta>

/** One item per app, each named for where it opens, in a group named Open in. */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    const items = within(group).getAllByRole('menuitem')
    await expect(items).toHaveLength(4)
    await userEvent.click(
      within(group).getByRole('menuitem', { name: 'Open in Zed' }),
    )
    await expect(args.onOpen).toHaveBeenCalledWith(apps[2])
  },
}

/** Busy: the apps are still being detected, so the one item says so. */
export const Busy: Story = {
  args: { loading: true },
  play: async () => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    await expect(
      within(group).getByRole('menuitem', { name: 'Detecting apps...' }),
    ).toHaveAttribute('aria-disabled', 'true')
  },
}

/** Disabled: no project path, so the one item says why nothing can open. */
export const Disabled: Story = {
  args: { disabledReason: 'This project has no folder on disk' },
  play: async () => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    const item = within(group).getByRole('menuitem', {
      name: 'This project has no folder on disk',
    })
    await expect(item).toHaveAttribute('aria-disabled', 'true')
    await expect(within(group).getAllByRole('menuitem')).toHaveLength(1)
  },
}

/** Empty: no app was found, so the group holds only its label. */
export const Empty: Story = {
  args: { apps: [] },
  play: async () => {
    const group = await screen.findByRole('group', { name: 'Open in' })
    await expect(within(group).queryAllByRole('menuitem')).toHaveLength(0)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
