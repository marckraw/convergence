import { Profiler, type ReactNode } from 'react'
import { perfApi } from './perf.api'
import type { PerfRoot } from './perf-marks.pure'
import { recordPerfCommit } from './usePerfProbe'

export function PerfProfiler({
  id,
  children,
}: {
  id: PerfRoot
  children: ReactNode
}) {
  if (!perfApi.isEnabled()) return children
  return (
    <Profiler id={id} onRender={recordPerfCommit}>
      {children}
    </Profiler>
  )
}
