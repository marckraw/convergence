import { Button } from '@convergence/ui'
import type { ParallelWorkMarker } from './parallel-work.pure'
export function ParallelWorkMarkerView({
  marker,
  onSelect,
}: {
  marker: ParallelWorkMarker
  onSelect: (id: string) => void
}) {
  return (
    <Button
      variant="ghost"
      onClick={() => onSelect(marker.rowKey)}
      size="lg"
      // Work going on beside the conversation is info (R1: working).
      className="my-2 flex h-auto w-full items-center justify-start whitespace-normal rounded-md border border-info-line bg-info-soft px-3 text-left text-xs text-info-ink hover:bg-info-soft hover:text-info-ink"
    >
      <span aria-hidden>↳</span>
      {marker.label}
      <span className="ml-auto" aria-hidden>
        ↗
      </span>
    </Button>
  )
}
