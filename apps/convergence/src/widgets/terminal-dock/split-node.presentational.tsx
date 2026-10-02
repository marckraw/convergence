import type { FC } from 'react'
import { Fragment } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PaneTree } from '@/entities/terminal'
import { cn, resizeHandleStyles } from '@convergence/ui'
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
  const { tree, onResizeSplit, dockControls, ...leafHandlers } = props
  if (tree.kind === 'leaf') {
    return (
      <LeafPaneView {...leafHandlers} leaf={tree} dockControls={dockControls} />
    )
  }
  // The dock's controls are drawn once, at its top-right corner: on the
  // right-hand pane of panes side by side, on the top one of panes stacked.
  const corner = tree.direction === 'horizontal' ? tree.children.length - 1 : 0
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
              dockControls={index === corner ? dockControls : undefined}
              tree={child}
            />
          </Panel>
          {index < tree.children.length - 1 ? (
            // The resize line's one look (NAV-16): a 13 px hit area, a
            // hairline under the pointer, the focus colour for the keyboard;
            // react-resizable-panels keeps the gesture and the keys. Panes
            // side by side part on a line running down. The panes have no
            // edge of their own, so the line shows at rest too.
            <Separator
              className={cn(
                resizeHandleStyles.base,
                tree.direction === 'horizontal'
                  ? resizeHandleStyles.vertical
                  : resizeHandleStyles.horizontal,
                'bg-line/50',
              )}
            />
          ) : null}
        </Fragment>
      ))}
    </Group>
  )
}
