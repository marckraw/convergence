import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [detail, setDetail] = useState<{
    rowKey: string
    value: { items: ConversationItem[]; error: string | null }
  } | null>(null)
  useEffect(() => {
    if (!rowKey) return
    const [readSessionId, , ids] = JSON.parse(rowKey) as [
      string,
      string,
      string[],
    ]
    let active = true
    let revision = 0
    let fetchedIds = new Set<string>()
    const read = () => {
      const current = ++revision
      void parallelWorkApi.readDetail(readSessionId, ids).then(
        (items) => {
          if (active && current === revision) {
            fetchedIds = new Set(items.map((item) => item.id))
            setDetail({ rowKey, value: { items, error: null } })
          }
        },
        (failure: unknown) => {
          if (active && current === revision)
            setDetail({
              rowKey,
              value: {
                items: [],
                error:
                  failure instanceof Error ? failure.message : String(failure),
              },
            })
        },
      )
    }
    read()
    const unsubscribe = parallelWorkApi.subscribeConversation((event) => {
      if (event.sessionId !== readSessionId) return
      if (
        event.op === 'snapshot' ||
        ((event.op === 'patch' || event.op === 'add') &&
          (fetchedIds.has(event.item.id) ||
            ids.includes(event.item.agentRunId ?? '') ||
            ids.includes(event.item.taskId ?? '')))
      )
        read()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [rowKey, status])
  return detail && detail.rowKey === rowKey ? detail.value : NO_DETAIL
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
  const [record, setRecord] = useState<{
    sessionId: string
    idsKey: string
    items: ConversationItem[]
    error: string | null
  } | null>(null)
  useEffect(() => {
    const ids = JSON.parse(idsKey) as string[]
    if (!ids.length) return
    let active = true
    let revision = 0
    const read = () => {
      const current = ++revision
      void parallelWorkApi
        .readTaskItems(sessionId, ids)
        .then((items) => {
          if (active && current === revision)
            setRecord({ sessionId, idsKey, items, error: null })
        })
        .catch((failure: unknown) => {
          if (active && current === revision)
            setRecord({
              sessionId,
              idsKey,
              items: [],
              error:
                failure instanceof Error ? failure.message : String(failure),
            })
        })
    }
    read()
    const unsubscribe = parallelWorkApi.subscribeConversation((event) => {
      if (
        event.sessionId === sessionId &&
        (event.op === 'snapshot' ||
          ((event.op === 'add' || event.op === 'patch') &&
            ids.includes(event.item.taskId ?? '')))
      )
        read()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [sessionId, idsKey])
  return record?.sessionId === sessionId && record.idsKey === idsKey
    ? record
    : NO_DETAIL
}
