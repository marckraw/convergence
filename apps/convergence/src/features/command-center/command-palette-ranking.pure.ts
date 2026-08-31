import type { IFuseOptions, FuseResult } from 'fuse.js'
import type { AttentionState, NeedsYouDismissals } from '@/entities/session'
import type {
  PaletteItem,
  SessionPaletteItem,
  ProjectPaletteItem,
  WorkspacePaletteItem,
  DialogPaletteItem,
  ForkSessionPaletteItem,
  SwapPrimarySurfacePaletteItem,
  CheckUpdatesPaletteItem,
  CuratedSection,
  CuratedSections,
  RankedItem,
} from './command-center.types'

const WAITING_CAP = 8
const REVIEW_CAP = 8
const RECENTS_CAP = 5
const PROJECTS_CAP = 8
const WORKSPACES_CAP = 8

const PALETTE_FUSE_KEYS: IFuseOptions<PaletteItem>['keys'] = [
  { name: 'search.sessionName', weight: 1.0 },
  { name: 'search.projectName', weight: 0.8 },
  { name: 'search.branchName', weight: 0.7 },
  { name: 'search.providerId', weight: 0.4 },
  { name: 'search.attentionAlias', weight: 0.3 },
  { name: 'search.title', weight: 1.0 },
  { name: 'search.aliases', weight: 0.6 },
]

export const PALETTE_FUSE_OPTIONS: IFuseOptions<PaletteItem> = {
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
  keys: PALETTE_FUSE_KEYS,
}

function attentionPriority(attention: AttentionState): number {
  switch (attention) {
    case 'needs-approval':
      return 0
    case 'needs-input':
      return 1
    case 'failed':
      return 2
    case 'finished':
      return 3
    default:
      return 99
  }
}

function isDismissed(
  session: SessionPaletteItem,
  dismissals: NeedsYouDismissals,
): boolean {
  const record = dismissals[session.sessionId]
  return record?.updatedAt === session.updatedAt
}

function compareSessionsForAttention(
  a: SessionPaletteItem,
  b: SessionPaletteItem,
): number {
  const priorityDelta =
    attentionPriority(a.attention) - attentionPriority(b.attention)
  if (priorityDelta !== 0) return priorityDelta
  return b.updatedAt.localeCompare(a.updatedAt)
}

export function buildCuratedSections(
  items: PaletteItem[],
  dismissals: NeedsYouDismissals,
  recents: string[],
): CuratedSections {
  const sessionItems = items.filter(
    (item): item is SessionPaletteItem => item.kind === 'session',
  )
  const projectItems = items.filter(
    (item): item is ProjectPaletteItem => item.kind === 'project',
  )
  const workspaceItems = items.filter(
    (item): item is WorkspacePaletteItem => item.kind === 'workspace',
  )
  const dialogItems = items.filter(
    (item): item is DialogPaletteItem => item.kind === 'dialog',
  )
  const checkUpdatesItems = items.filter(
    (item): item is CheckUpdatesPaletteItem => item.kind === 'check-updates',
  )
  const forkSessionItems = items.filter(
    (item): item is ForkSessionPaletteItem => item.kind === 'fork-session',
  )
  const swapSurfaceItems = items.filter(
    (item): item is SwapPrimarySurfacePaletteItem =>
      item.kind === 'swap-primary-surface',
  )

  const waiting = sessionItems
    .filter(
      (session) =>
        (session.attention === 'needs-approval' ||
          session.attention === 'needs-input') &&
        !isDismissed(session, dismissals),
    )
    .sort(compareSessionsForAttention)
    .slice(0, WAITING_CAP)

  const review = sessionItems
    .filter(
      (session) =>
        (session.attention === 'failed' || session.attention === 'finished') &&
        !isDismissed(session, dismissals),
    )
    .sort(compareSessionsForAttention)
    .slice(0, REVIEW_CAP)

  const attentionIds = new Set<string>([
    ...waiting.map((session) => session.sessionId),
    ...review.map((session) => session.sessionId),
  ])

  const sessionsById = new Map(
    sessionItems.map((session) => [session.sessionId, session]),
  )
  const recentItems: SessionPaletteItem[] = []
  for (const id of recents) {
    if (attentionIds.has(id)) continue
    const session = sessionsById.get(id)
    if (!session) continue
    recentItems.push(session)
    if (recentItems.length >= RECENTS_CAP) break
  }

  const sections: CuratedSection[] = [
    { id: 'waiting-on-you', title: 'Waiting on You', items: waiting },
    { id: 'needs-review', title: 'Needs Review', items: review },
    {
      id: 'session-actions',
      title: 'Session Actions',
      items: [...forkSessionItems, ...swapSurfaceItems],
    },
    { id: 'recent-sessions', title: 'Recent Sessions', items: recentItems },
    {
      id: 'projects',
      title: 'Projects',
      items: projectItems.slice(0, PROJECTS_CAP),
    },
    {
      id: 'workspaces',
      title: 'Workspaces',
      items: workspaceItems.slice(0, WORKSPACES_CAP),
    },
    {
      id: 'dialogs',
      title: 'Dialogs',
      items: [...dialogItems, ...checkUpdatesItems],
    },
  ]

  return sections
}

export interface PaletteFuse {
  search(query: string): FuseResult<PaletteItem>[]
}

function queryTokens(query: string): string[] {
  return query.split(/\s+/).filter(Boolean)
}

export function rankForQuery(
  items: PaletteItem[],
  query: string,
  fuse: PaletteFuse,
): RankedItem[] {
  const trimmed = query.trim()
  if (!trimmed || items.length === 0) return []

  const tokens = queryTokens(trimmed)
  if (tokens.length === 1) {
    return fuse.search(trimmed).map((result) => ({
      item: result.item,
      score: result.score ?? 1,
    }))
  }

  const hitsById = new Map<
    string,
    { item: PaletteItem; score: number; tokenHits: number }
  >()

  for (const token of tokens) {
    const tokenResults = fuse.search(token)
    if (tokenResults.length === 0) return []

    for (const result of tokenResults) {
      const score = result.score ?? 1
      const existing = hitsById.get(result.item.id)
      if (existing) {
        existing.score += score
        existing.tokenHits += 1
      } else {
        hitsById.set(result.item.id, {
          item: result.item,
          score,
          tokenHits: 1,
        })
      }
    }
  }

  return [...hitsById.values()]
    .filter((hit) => hit.tokenHits === tokens.length)
    .map((hit) => ({ item: hit.item, score: hit.score }))
    .sort((a, b) => a.score - b.score)
}
