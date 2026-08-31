import type { FC, ReactNode } from 'react'
import type { DockPlacement } from '@/entities/terminal'
import { workspaceLayoutStyles } from './workspace-layout.styles'

export interface WorkspaceLayoutViewProps {
  mainSlot: ReactNode
  dockSlot?: ReactNode | null
  dockVisible: boolean
  dockPlacement?: DockPlacement
}

export const WorkspaceLayoutView: FC<WorkspaceLayoutViewProps> = ({
  mainSlot,
  dockSlot,
  dockVisible,
  dockPlacement = 'bottom',
}) => {
  const isSide = dockPlacement === 'left' || dockPlacement === 'right'
  const rootClass = isSide
    ? workspaceLayoutStyles.rootSide
    : workspaceLayoutStyles.rootBottom
  const dockOnLeft = dockPlacement === 'left'
  const renderedDock = dockVisible && dockSlot ? dockSlot : null
  const main = <div className={workspaceLayoutStyles.mainSlot}>{mainSlot}</div>

  return (
    <div
      className={rootClass}
      data-testid="workspace-layout"
      data-dock-placement={dockPlacement}
    >
      {dockOnLeft ? renderedDock : null}
      {main}
      {!dockOnLeft ? renderedDock : null}
    </div>
  )
}
