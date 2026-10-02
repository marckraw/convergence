import type { FC } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  SessionCardView,
} from '@/features/mission-control'
import {
  CANVAS_DRAW_HANDLE,
  CANVAS_HIDDEN_HANDLE,
} from './session-canvas.styles'
import { CANVAS_HANDLE, CANVAS_SIDE_HANDLE } from './session-canvas.types'
import type { CanvasSessionNodeData } from './session-canvas.types'

/**
 * A session as it appears on the canvas: the Session Card's own compact face
 * (MC-4), so one session reads the same in every view, the unreachable host
 * included.
 *
 * It drops the Hail and the crew picker. Those are gestures aimed at one
 * session, and the canvas is for reading how sessions are wired to each other
 * -- the card grid is still one click away for operating them. The body click
 * navigates, exactly like the card's.
 */
export const CanvasSessionNode: FC<NodeProps> = ({ data }) => {
  const {
    card,
    crewId,
    onOpen,
    authoring = false,
    connecting = false,
    connectSource = false,
    onPick,
  } = data as unknown as CanvasSessionNodeData
  const { session } = card
  const handleClass = authoring ? CANVAS_DRAW_HANDLE : CANVAS_HIDDEN_HANDLE

  /**
   * One gesture, two meanings, and the mode decides which -- never the input
   * device. The body is a button, so a click and Enter are one event: both
   * PICK while Connect is armed and both OPEN otherwise, and the keyboard
   * route cannot drift from the pointer's.
   */
  const activate = () => {
    if (connecting && onPick) {
      onPick(session.id)
      return
    }
    onOpen(card)
  }

  return (
    <SessionCardView
      card={card}
      density="node"
      data-canvas-session-node={session.id}
      // Which crew this card is drawn inside, so a click selects it — the
      // toolbar and the right-hand panel have to be about something, and a
      // session in two crews is a different card in each.
      data-canvas-crew-id={crewId}
      style={{ width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT }}
      // The chosen source is lit, so "which one did I pick" is answerable
      // by looking rather than by remembering.
      picked={connectSource}
      actionLabel={
        connecting
          ? connectSource
            ? `${session.name} is the source — pick a recipient, or pick it again to start over`
            : `Connect to ${session.name}`
          : `Open ${session.name}`
      }
      onOpen={activate}
    >
      {/* The ports come after the body, so they paint over its stretched
          door: a handle you can see is a handle you can grab. */}
      <Handle
        id={CANVAS_HANDLE.in}
        type="target"
        position={Position.Left}
        isConnectable={authoring}
        className={handleClass}
      />
      <Handle
        id={CANVAS_HANDLE.out}
        type="source"
        position={Position.Right}
        isConnectable={authoring}
        className={handleClass}
      />

      {/* The underside pair, used only by wires that point back at an earlier
          column -- the returning half of a review loop. */}
      {/* The remaining sides (R11). Never connectable, even while authoring:
          which side a wire leaves by is a routing decision the canvas makes
          from where the two cards are, and offering four pairs of ports would
          ask the person to choose the geometry of their own connection. */}
      <Handle
        id={CANVAS_SIDE_HANDLE.source.left}
        type="source"
        position={Position.Left}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_SIDE_HANDLE.source.top}
        type="source"
        position={Position.Top}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_SIDE_HANDLE.target.right}
        type="target"
        position={Position.Right}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_SIDE_HANDLE.target.top}
        type="target"
        position={Position.Top}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_HANDLE.loopOut}
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
      <Handle
        id={CANVAS_HANDLE.loopIn}
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className={CANVAS_HIDDEN_HANDLE}
      />
    </SessionCardView>
  )
}
