import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ProjectOpenApp } from './project-open.types'
import {
  DETECTING_APPS_LABEL,
  NO_APPS_FOUND_LABEL,
} from './project-open-list.pure'
import { ProjectOpenMenu } from './project-open-menu.presentational'

const apps: ProjectOpenApp[] = [
  { id: 'cursor', label: 'Cursor', kind: 'editor' },
  { id: 'vscode', label: 'VS Code', kind: 'editor' },
  { id: 'zed', label: 'Zed', kind: 'editor' },
  { id: 'finder', label: 'Finder', kind: 'file-manager' },
]

const meta = {
  title: 'Entities/ProjectOpen/ProjectOpenMenu',
  component: ProjectOpenMenu,
  args: {
    apps,
    note: null,
    onOpen: fn(),
    label: 'Open project',
  },
} satisfies Meta<typeof ProjectOpenMenu>

export default meta

type Story = StoryObj<typeof meta>

const openMenu = async (
  canvas: ReturnType<typeof within>,
  userEvent: { click: (element: Element) => Promise<void> },
  name: string,
) => {
  await userEvent.click(canvas.getByRole('button', { name }))
  return screen.findByRole('menu')
}

/** Each app is named for where it opens, the same words as the Project panel's. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const menu = await openMenu(canvas, userEvent, 'Open project')
    await expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Open in Cursor',
      'Open in VS Code',
      'Open in Zed',
      'Open in Finder',
    ])
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Open in Zed' }),
    )
    await expect(args.onOpen).toHaveBeenCalledWith(apps[2])
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A skill's folder: its own name and tooltip, the same list. */
export const SkillFolder: Story = {
  name: 'Skill folder',
  args: {
    label: 'Open in editor',
    tooltip: 'Open the skill folder in an editor',
  },
  play: async ({ canvas, userEvent }) => {
    const menu = await openMenu(canvas, userEvent, 'Open in editor')
    await waitFor(() =>
      expect(
        within(menu).getByRole('menuitem', { name: 'Open in Cursor' }),
      ).toBeVisible(),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** Busy: the apps are still being looked for, and the list says so. */
export const Busy: Story = {
  args: { apps: [], note: DETECTING_APPS_LABEL },
  play: async ({ canvas, userEvent }) => {
    const menu = await openMenu(canvas, userEvent, 'Open project')
    await expect(
      within(menu).getByRole('menuitem', { name: DETECTING_APPS_LABEL }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** Empty: none of the apps is installed; the list says that, not nothing. */
export const Empty: Story = {
  args: { apps: [], note: NO_APPS_FOUND_LABEL },
  play: async ({ canvas, userEvent }) => {
    const menu = await openMenu(canvas, userEvent, 'Open project')
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    await expect(menu).toHaveTextContent(NO_APPS_FOUND_LABEL)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

/** Disabled: no path to open; the trigger stays, and the list gives the reason. */
export const Disabled: Story = {
  args: { apps: [], note: 'No project path available' },
  play: async ({ canvas, userEvent }) => {
    const menu = await openMenu(canvas, userEvent, 'Open project')
    await expect(menu).toHaveTextContent('No project path available')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}
