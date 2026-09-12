import { Button } from '@/shared/ui/button'
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
      className="h-auto justify-start whitespace-normal my-2 flex w-full items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-left text-xs text-blue-600 dark:text-blue-400"
      onClick={() => onSelect(marker.rowKey)}
    >
      <span aria-hidden>↳</span>
      {marker.label}
      <span className="ml-auto" aria-hidden>
        ↗
      </span>
    </Button>
  )
}
