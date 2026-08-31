import type { FC } from 'react'
import { Fragment } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PaneTree } from '@/entities/terminal'
import { cn } from '@/shared/lib/cn.pure'
import { LeafPaneView } from './leaf-pane.presentational'
import type { LeafPaneHandlers } from './leaf-pane.presentational'

export interface SplitNodeHandlers extends LeafPaneHandlers {
  onResizeSplit: (splitId: string, sizes: number[]) => void
}

interface SplitNodeProps extends SplitNodeHandlers {
  tree: PaneTree
}

const panelId = (splitId: string, childId: string) => `${splitId}:${childId}`

export const SplitNodeView: FC<SplitNodeProps> = (props) => {
  const { tree, onResizeSplit, ...leafHandlers } = props
  if (tree.kind === 'leaf') {
    return <LeafPaneView {...leafHandlers} leaf={tree} />
  }
  return (
    <Group
      orientation={tree.direction}
      id={tree.id}
      className="h-full w-full"
      onLayoutChanged={(layout) => {
        const sizes = tree.children.map(
          (child) => layout[panelId(tree.id, child.id)] ?? 0,
        )
        onResizeSplit(tree.id, sizes)
      }}
    >
      {tree.children.map((child, index) => (
        <Fragment key={child.id}>
          <Panel
            id={panelId(tree.id, child.id)}
            defaultSize={tree.sizes[index] ?? 100 / tree.children.length}
            minSize={10}
          >
            <SplitNodeView
              {...leafHandlers}
              onResizeSplit={onResizeSplit}
              tree={child}
            />
          </Panel>
          {index < tree.children.length - 1 ? (
            <Separator
              className={cn(
                'relative z-10 shrink-0 bg-border/50 transition-colors hover:bg-border',
                tree.direction === 'horizontal'
                  ? 'w-px cursor-col-resize'
                  : 'h-px cursor-row-resize',
              )}
            />
          ) : null}
        </Fragment>
      ))}
    </Group>
  )
}
