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
      className="h-auto justify-start whitespace-normal my-2 flex w-full items-center rounded-md border border-blue-500/20 bg-blue-500/5 px-3 text-left text-xs text-blue-600 dark:text-blue-400"
    >
      <span aria-hidden>↳</span>
      {marker.label}
      <span className="ml-auto" aria-hidden>
        ↗
      </span>
    </Button>
  )
}
