function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Unknown protocol shapes cannot certify that a server is idle. */
export function readCodexLoadedThreadPage(value: unknown): {
  ids: string[]
  nextCursor: string | null
} {
  const page = record(value)
  const data = page?.data
  if (
    !Array.isArray(data) ||
    !data.every((id): id is string => typeof id === 'string' && id.length > 0)
  ) {
    throw new Error(
      'Codex did not report its loaded conversations in a recognized format.',
    )
  }
  const cursor = page?.nextCursor
  if (
    cursor !== undefined &&
    cursor !== null &&
    (typeof cursor !== 'string' || !cursor)
  ) {
    throw new Error('Codex returned an invalid loaded-conversation cursor.')
  }
  return { ids: data, nextCursor: typeof cursor === 'string' ? cursor : null }
}

export function isCodexThreadRuntimeIdle(value: unknown): boolean {
  const thread = record(record(value)?.thread)
  const status = record(thread?.status)?.type
  if (status === 'idle' || status === 'notLoaded') return true
  if (status === 'active' || status === 'systemError') return false
  throw new Error(
    'Codex did not report a recognized conversation runtime status.',
  )
}
