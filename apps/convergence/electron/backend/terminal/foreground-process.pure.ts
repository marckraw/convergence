export interface PsRow {
  pid: number
  ppid: number
  comm: string
}

export interface ForegroundProcess {
  pid: number
  name: string
}

export function parsePsOutput(output: string): PsRow[] {
  if (!output) return []
  const lines = output.split('\n')
  const rows: PsRow[] = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) continue
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    if (!match) continue
    const pid = Number(match[1])
    const ppid = Number(match[2])
    const comm = match[3]!.trim()
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue
    if (!comm) continue
    rows.push({ pid, ppid, comm })
  }
  return rows
}

function extractName(comm: string): string {
  const first = comm.split(/\s+/)[0] ?? comm
  const basename = first.split('/').pop() ?? first
  return basename
}

export function findForegroundDescendant(
  rows: PsRow[],
  shellPid: number,
): ForegroundProcess | null {
  const shellExists = rows.some((r) => r.pid === shellPid)
  if (!shellExists) return null

  const childrenByParent = new Map<number, PsRow[]>()
  for (const row of rows) {
    const list = childrenByParent.get(row.ppid) ?? []
    list.push(row)
    childrenByParent.set(row.ppid, list)
  }

  let current: PsRow | null = null
  let parentPid = shellPid
  while (true) {
    const children = childrenByParent.get(parentPid)
    if (!children || children.length === 0) break
    const pick = children.reduce((acc, row) => (row.pid > acc.pid ? row : acc))
    current = pick
    parentPid = pick.pid
  }

  if (!current) return null
  return { pid: current.pid, name: extractName(current.comm) }
}
