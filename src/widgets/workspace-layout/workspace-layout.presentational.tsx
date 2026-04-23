import type { FC, ReactNode } from 'react'
import { workspaceLayoutStyles } from './workspace-layout.styles'

export interface WorkspaceLayoutViewProps {
  mainSlot: ReactNode
  dockSlot?: ReactNode | null
  dockVisible: boolean
}

export const WorkspaceLayoutView: FC<WorkspaceLayoutViewProps> = ({
  mainSlot,
  dockSlot,
  dockVisible,
}) => (
  <div className={workspaceLayoutStyles.root} data-testid="workspace-layout">
    <div className={workspaceLayoutStyles.mainSlot}>{mainSlot}</div>
    {dockVisible && dockSlot ? dockSlot : null}
  </div>
)
