import type { ComponentProps, FC } from 'react'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useCommandCenterStore } from '@/features/command-center'
import {
  formatShortcutLabel,
  runningShortcutPlatform,
} from '@/shared/lib/keyboard-shortcut.pure'
import { SidebarToolsMenu } from './sidebar-tools-menu.presentational'

type SidebarToolsMenuContainerProps = Omit<
  ComponentProps<typeof SidebarToolsMenu>,
  'commandCenter'
>

/**
 * The sidebar's Tools, with the way into the Command Center (NAV-23): its
 * item opens the palette and shows the key the palette listens for, the
 * one the settings record (⌘K unless rebound).
 */
export const SidebarToolsMenuContainer: FC<SidebarToolsMenuContainerProps> = (
  props,
) => {
  const open = useCommandCenterStore((state) => state.open)
  const binding = useAppSettingsStore(
    (state) => state.settings.commandCenterShortcut,
  )
  return (
    <SidebarToolsMenu
      {...props}
      commandCenter={{
        shortcut: formatShortcutLabel(binding, runningShortcutPlatform()),
        onOpen: open,
      }}
    />
  )
}
