import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationItem } from '@/entities/session'
import type {
  SessionAgentRun,
  SessionTask,
} from '@/shared/types/harness-evidence.types'
import {
  buildParallelWork,
  parallelWorkRowState,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { parallelWorkApi } from './parallel-work.api'
import { sameParallelWorkEvidence, workRowKey } from './parallel-work.pure'

/**
 * The session's parallel work as panel rows. Built from the evidence record
 * alone: a run's parent arrives on the run (MAR-3310 O0b R4), so the rows no
 * longer read — or wait on — the loaded conversation.
 */
export function useParallelWork(sessionId: string | null) {
  const [readRevision, setReadRevision] = useState(0)
  const retry = useCallback(() => setReadRevision((value) => value + 1), [])
  const [settledSessionId, setSettledSessionId] = useState<string | null>(null)
  const [record, setRecord] = useState<{
    sessionId: string
    runs: SessionAgentRun[]
    tasks: SessionTask[]
  } | null>(null)
  const [error, setError] = useState<{
    sessionId: string
    message: string
  } | null>(null)
  useEffect(() => {
    if (!sessionId) return
    let active = true
    let revision = 0
    const read = async () => {
      const current = ++revision
      try {
        const next = await parallelWorkApi.read(sessionId)
        if (active && current === revision) {
          // An evidence event that changed nothing keeps the record, so the
          // rows and everything derived from them keep their identity
          // (MAR-3310 F1e R4).
          setRecord((previous) =>
            previous?.sessionId === sessionId &&
            sameParallelWorkEvidence(previous, next)
              ? previous
              : { sessionId, ...next },
          )
          setError(null)
        }
      } catch (failure) {
        if (active && current === revision)
          setError({
            sessionId,
            message:
              failure instanceof Error ? failure.message : String(failure),
          })
      } finally {
        if (active && current === revision) setSettledSessionId(sessionId)
      }
    }
    void read()
    const unsubscribe = parallelWorkApi.subscribe((event) => {
      if (event.sessionId === sessionId) void read()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [sessionId, readRevision])
  const rows = useMemo(
    () =>
      record?.sessionId === sessionId
        ? buildParallelWork(record.runs, record.tasks)
        : [],
    [record, sessionId],
  )
  return {
    rows,
    hasRecord: record?.sessionId === sessionId,
    retry,
    error: error?.sessionId === sessionId ? error.message : null,
    loading: Boolean(sessionId) && settledSessionId !== sessionId,
  }
}

const NO_DETAIL: { items: ConversationItem[]; error: string | null } = {
  items: [],
  error: null,
}

/**
 * The selected row's items, read from main by id (MAR-3310 O0b R2).
 *
 * Read when the selection or the row's ids change, and again when the row's
 * status changes. A reply is kept only for the row it was asked about: a
 * reply for another selection is dropped on arrival, and a kept one is
 * served only while that row is still the one selected — a status re-read
 * keeps the last reply up until its successor lands, so a window never
 * blinks back to only what is loaded.
 */
export function useParallelWorkDetail(
  sessionId: string,
  row: ParallelWorkRow | undefined,
): { items: ConversationItem[]; error: string | null } {
  const state = row ? parallelWorkRowState(row) : null
  const rowKey = row
    ? JSON.stringify([sessionId, workRowKey(row), state!.ids])
    : null
  const status = state?.fact?.status ?? null
  return useParallelWorkItems(rowKey, status, parallelWorkApi.readDetail)
}

/** Result notes for every card, including cards whose output predates the window. */
export function useParallelWorkResults(
  sessionId: string,
  rows: ParallelWorkRow[],
  open: boolean,
) {
  const idsKey = JSON.stringify(
    open
      ? [
          ...new Set(rows.flatMap((row) => parallelWorkRowState(row).ids)),
        ].sort()
      : [],
  )
  const key =
    open && idsKey !== '[]'
      ? JSON.stringify([sessionId, 'results', JSON.parse(idsKey)])
      : null
  const revision = open
    ? JSON.stringify(
        rows.map((row) => [
          workRowKey(row),
          parallelWorkRowState(row).fact?.status,
        ]),
      )
    : null
  return useParallelWorkItems(
    key,
    revision,
    parallelWorkApi.readTaskResultNotes,
  )
}

/** Shared read lifecycle: one in flight and one trailing, with local patches. */
function useParallelWorkItems(
  key: string | null,
  revision: string | null,
  readItems: (sessionId: string, ids: string[]) => Promise<ConversationItem[]>,
) {
  const [record, setRecord] = useState<{
    key: string
    items: ConversationItem[]
    error: string | null
  } | null>(null)
  const queue = useRef<{
    running: boolean
    trailing: (() => Promise<void>) | null
  }>({ running: false, trailing: null })
  useEffect(() => {
    if (!key) return
    const [sessionId, , ids] = JSON.parse(key) as [string, string, string[]]
    let active = true
    const patches = new Map<string, ConversationItem>()
    const job = async () => {
      if (!active) return
      patches.clear()
      try {
        const items = await readItems(sessionId, ids)
        if (active)
          setRecord({
            key,
            items: items.map((item) => patches.get(item.id) ?? item),
            error: null,
          })
      } catch (failure) {
        if (active)
          setRecord({
            key,
            items: [],
            error: failure instanceof Error ? failure.message : String(failure),
          })
      }
    }
    const read = () => {
      const state = queue.current
      state.trailing = job
      if (state.running) return
      state.running = true
      void (async () => {
        while (state.trailing) {
          const next = state.trailing
          state.trailing = null
          await next()
        }
        state.running = false
      })()
    }
    read()
    const unsubscribe = parallelWorkApi.subscribeConversation((event) => {
      if (event.sessionId !== sessionId) return
      if (event.op === 'snapshot') read()
      if (event.op === 'patch') {
        if (queue.current.running) patches.set(event.item.id, event.item)
        setRecord((previous) =>
          previous?.key === key &&
          previous.items.some((item) => item.id === event.item.id)
            ? {
                ...previous,
                items: previous.items.map((item) =>
                  item.id === event.item.id ? event.item : item,
                ),
              }
            : previous,
        )
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [key, revision, readItems])
  return record?.key === key
    ? { items: record.items, error: record.error }
    : NO_DETAIL
}
