import type {
  ProviderQuotaAvailableSnapshot,
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from './provider-quota.types'
import { readRecord } from './codex-quota.pure'

interface CursorTeamMemberSpend {
  spendCents: number
  fastPremiumRequests: number | null
  name: string | null
  email: string
  role: string | null
  hardLimitOverrideDollars: number | null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function readMemberSpend(value: unknown): CursorTeamMemberSpend | null {
  const record = readRecord(value)
  if (!record) return null

  const spendCents = readNumber(record.spendCents)
  const email = typeof record.email === 'string' ? record.email.trim() : ''
  if (spendCents === null || email === '') return null

  return {
    spendCents,
    fastPremiumRequests: readNumber(record.fastPremiumRequests),
    name: typeof record.name === 'string' ? record.name : null,
    email,
    role: typeof record.role === 'string' ? record.role : null,
    hardLimitOverrideDollars: readNumber(record.hardLimitOverrideDollars),
  }
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

function nextSubscriptionReset(
  subscriptionCycleStart: number | null,
  nowIso: string,
): string | null {
  if (subscriptionCycleStart === null) return null
  const start = new Date(subscriptionCycleStart)
  const now = new Date(nowIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(now.getTime())) return null

  let reset = new Date(start)
  while (reset <= now) {
    reset = addMonths(reset, 1)
  }
  return reset.toISOString()
}

function findMember(
  members: CursorTeamMemberSpend[],
  email: string | null,
): CursorTeamMemberSpend {
  if (email) {
    const normalized = email.toLowerCase()
    const member = members.find(
      (entry) => entry.email.toLowerCase() === normalized,
    )
    if (!member) {
      throw new Error(
        `Cursor team spend did not include ${email}. Check ${email} or unset CURSOR_USAGE_EMAIL.`,
      )
    }
    return member
  }

  if (members.length === 1) return members[0]

  throw new Error(
    'Cursor Admin API returned multiple members. Set CURSOR_USAGE_EMAIL to choose which user to display.',
  )
}

function buildSpendWindow(
  member: CursorTeamMemberSpend,
  resetAt: string | null,
): ProviderQuotaWindow | null {
  const hardLimitDollars = member.hardLimitOverrideDollars
  if (hardLimitDollars === null || hardLimitDollars <= 0) return null

  const limitCents = hardLimitDollars * 100
  const usedPercent = clampPercent((member.spendCents / limitCents) * 100)

  return {
    kind: 'other',
    label: 'On-demand spend limit',
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    windowMinutes: null,
    resetsAt: resetAt,
  }
}

export function buildCursorQuotaUnavailableSnapshot(
  reason: string,
  nowIso: string,
): ProviderQuotaSnapshot {
  return {
    providerId: 'cursor',
    status: 'unavailable',
    source: 'provider-api',
    reason,
    usageUrl: 'https://cursor.com/dashboard',
    lastCheckedAt: nowIso,
    stale: false,
  }
}

export function mapCursorTeamSpendPayloadToQuotaSnapshot(
  payload: unknown,
  nowIso: string,
  options: { email?: string | null } = {},
): ProviderQuotaAvailableSnapshot {
  const record = readRecord(payload)
  if (!record) {
    throw new Error('Cursor team spend payload was not an object.')
  }

  const rawMembers = Array.isArray(record.teamMemberSpend)
    ? record.teamMemberSpend
    : []
  const members = rawMembers
    .map(readMemberSpend)
    .filter((member): member is CursorTeamMemberSpend => member !== null)
  if (members.length === 0) {
    throw new Error('Cursor team spend response did not include members.')
  }

  const email = options.email?.trim() || null
  const member = findMember(members, email)
  const subscriptionCycleStart = readNumber(record.subscriptionCycleStart)
  const resetAt = nextSubscriptionReset(subscriptionCycleStart, nowIso)
  const window = buildSpendWindow(member, resetAt)
  const limitDollars = member.hardLimitOverrideDollars
  const limitCents =
    limitDollars === null || limitDollars <= 0 ? null : limitDollars * 100
  const remainingCents =
    limitCents === null ? null : Math.max(0, limitCents - member.spendCents)

  return {
    providerId: 'cursor',
    status: 'available',
    source: 'provider-api',
    planType: member.role,
    windows: window ? [window] : [],
    credits:
      remainingCents === null
        ? null
        : {
            hasCredits: remainingCents > 0,
            unlimited: false,
            balance: formatUsd(remainingCents),
          },
    limitReachedType:
      remainingCents !== null && remainingCents <= 0
        ? 'on-demand-spend-limit'
        : null,
    details: [
      `User: ${member.email}`,
      `Current spend: ${formatUsd(member.spendCents)}`,
      limitCents === null
        ? 'Hard limit: not reported'
        : `Hard limit: ${formatUsd(limitCents)}`,
      member.fastPremiumRequests === null
        ? 'Fast premium requests: not reported'
        : `Fast premium requests: ${member.fastPremiumRequests.toLocaleString()}`,
      'Source: official Cursor Admin API team spend endpoint',
      'Availability: Cursor team admins only; personal Pro accounts do not expose this usage endpoint.',
    ],
    lastCheckedAt: nowIso,
    stale: false,
  }
}
