import { useEffect, useRef, useState } from 'react'
import {
  createSaveAsYouGo,
  type SaveAsYouGo,
  type SaveTimers,
  type SaveWork,
} from './save-as-you-go.pure'

const windowTimers: SaveTimers = {
  set: (run, delayMs) => setTimeout(run, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * A dialog that saves as you go (R6, DLG earlier new thing 4): one scheduler
 * for the life of the component, reading the latest `prepare` each time it
 * saves, and saving what still waits when the component goes. Its three
 * functions never change, so handlers can depend on them freely.
 */
export function useSaveAsYouGo(prepare: () => SaveWork | null): SaveAsYouGo {
  const latest = useRef(prepare)
  latest.current = prepare
  const [scheduler] = useState(() =>
    createSaveAsYouGo(() => latest.current(), windowTimers),
  )
  // Leaving with a typed value still waiting keeps it.
  useEffect(() => () => scheduler.flush(), [scheduler])
  return scheduler
}
