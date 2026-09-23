import { useEffect, useState } from 'react'
import {
  releaseApi,
  type ReleasePlan,
  type ReleaseSeat,
} from '@/entities/release'
import { MergeReviewedView } from './merge-reviewed.presentational'

export function MergeReviewed({
  seat,
  enabled,
}: {
  seat: ReleaseSeat
  enabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<ReleasePlan | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!open) return
    let disposed = false
    void releaseApi
      .plan({ crewId: seat.crewId, sessionId: seat.sessionId })
      .then((next) => {
        if (disposed) return
        setPlan(next)
        setSelected(
          next.candidates
            .filter((row) => row.verdict === 'mergeable')
            .map((row) => row.issueId),
        )
      })
      .catch((reason: unknown) => {
        if (!disposed)
          setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      disposed = true
    }
  }, [open, seat.crewId, seat.sessionId, reload])

  useEffect(() => {
    if (!open) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const progress = await releaseApi.acts({
          crewId: seat.crewId,
          sessionId: seat.sessionId,
        })
        if (!disposed)
          setPlan((previous) =>
            previous ? { ...previous, ...progress } : null,
          )
      } catch (reason) {
        if (!disposed)
          setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 1000)
      }
    }
    timer = setTimeout(() => void poll(), 1000)
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [open, seat.crewId, seat.sessionId])

  const merge = async () => {
    if (!plan || busy) return
    setBusy(true)
    setError(null)
    try {
      const progress = await releaseApi.merge({
        ...seat,
        planId: plan.id,
        issueIds: selected,
      })
      setPlan((previous) => (previous ? { ...previous, ...progress } : null))
      setSelected([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <MergeReviewedView
      open={open}
      enabled={enabled}
      plan={plan}
      selected={selected}
      busy={busy}
      error={error}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setPlan(null)
          setError(null)
        }
      }}
      onToggle={(id) =>
        setSelected((previous) =>
          previous.includes(id)
            ? previous.filter((value) => value !== id)
            : [...previous, id],
        )
      }
      onRefresh={() => {
        setPlan(null)
        setError(null)
        setReload((value) => value + 1)
      }}
      onMerge={() => void merge()}
    />
  )
}
