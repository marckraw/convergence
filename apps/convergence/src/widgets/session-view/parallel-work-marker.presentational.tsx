import { Card, CardAction } from '@convergence/ui'
import type { ParallelWorkMarker } from './parallel-work.pure'
export function ParallelWorkMarkerView({
  marker,
  onSelect,
}: {
  marker: ParallelWorkMarker
  onSelect: (id: string) => void
}) {
  return (
    // Work going on beside the conversation is info (R1: working): a Card in
    // that tone, the line its door (a CardAction over the whole card), and the
    // tint kept under the pointer.
    <Card
      tone="info"
      interactive
      padding="none"
      className="my-2 text-xs font-medium text-info-ink hover:bg-info-soft"
    >
      <CardAction
        onClick={() => onSelect(marker.rowKey)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2"
      >
        <span aria-hidden>↳</span>
        {marker.label}
        <span className="ml-auto" aria-hidden>
          ↗
        </span>
      </CardAction>
    </Card>
  )
}
