import type {
  AnalyticsOverview,
  GeneratedWorkProfileSnapshotPayload,
} from './analytics.types'

function topLabels(
  items: Array<{
    providerName?: string
    projectName?: string
    turnsCompleted: number
  }>,
): string {
  if (items.length === 0) return 'none'
  return items
    .slice(0, 5)
    .map((item) => {
      const name = item.providerName ?? item.projectName ?? 'Unknown'
      return `${name} (${item.turnsCompleted} turns)`
    })
    .join(', ')
}

export function buildWorkProfilePrompt(overview: AnalyticsOverview): string {
  const profile = overview.deterministicProfile
  const peak = profile.peakActivity
    ? `weekday ${profile.peakActivity.weekday}, hour ${profile.peakActivity.hour}, count ${profile.peakActivity.count}`
    : 'none'

  return [
    'Create a concise Convergence work profile from aggregate local usage data only.',
    'Do not mention productivity, performance, surveillance, rankings, costs, tokens, or transcript excerpts.',
    'Use cautious language like "tend to", "often", "recently", and "based on local usage".',
    'Return only valid JSON with this exact shape:',
    '{"version":1,"title":"short profile title","summary":"2-3 sentence summary","themes":[{"label":"theme","description":"short description"}],"caveats":["short caveat"]}',
    '',
    `Range: ${overview.range.preset} (${overview.range.startDate ?? 'all'} to ${overview.range.endDate})`,
    `Totals: user messages ${overview.totals.userMessages}, assistant messages ${overview.totals.assistantMessages}, sessions ${overview.totals.sessionsCreated}, turns ${overview.totals.turnsCompleted}, files changed ${overview.totals.filesChanged}, approvals ${overview.totals.approvalRequests}, input requests ${overview.totals.inputRequests}.`,
    `Words: user ${overview.totals.userWords}, assistant ${overview.totals.assistantWords}.`,
    `Streaks: current ${overview.streaks.current}, longest ${overview.streaks.longest}.`,
    `Providers: ${topLabels(overview.providerUsage)}.`,
    `Projects: ${topLabels(overview.projectUsage)}.`,
    `Peak activity: ${peak}.`,
    `Deterministic summary: ${profile.summary}`,
    `Session size bucket: ${profile.sessionSizeBucket}.`,
    `Interaction shape: ${profile.interactionShape}.`,
  ].join('\n')
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1].trim() : trimmed
}

function parseTheme(
  value: unknown,
): { label: string; description: string } | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { label?: unknown; description?: unknown }
  if (
    typeof candidate.label !== 'string' ||
    typeof candidate.description !== 'string'
  ) {
    return null
  }
  return {
    label: candidate.label.trim(),
    description: candidate.description.trim(),
  }
}

export function parseGeneratedWorkProfilePayload(
  text: string,
): GeneratedWorkProfileSnapshotPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(text)) as unknown
  } catch {
    throw new Error('Generated work profile was not valid JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Generated work profile was not a JSON object')
  }

  const candidate = parsed as {
    title?: unknown
    summary?: unknown
    themes?: unknown
    caveats?: unknown
  }
  if (
    typeof candidate.title !== 'string' ||
    typeof candidate.summary !== 'string'
  ) {
    throw new Error('Generated work profile is missing title or summary')
  }

  const themes = Array.isArray(candidate.themes)
    ? candidate.themes.flatMap((theme) => {
        const parsedTheme = parseTheme(theme)
        return parsedTheme ? [parsedTheme] : []
      })
    : []
  const caveats = Array.isArray(candidate.caveats)
    ? candidate.caveats.filter(
        (caveat): caveat is string => typeof caveat === 'string',
      )
    : []

  return {
    version: 1,
    title: candidate.title.trim(),
    summary: candidate.summary.trim(),
    themes: themes.slice(0, 5),
    caveats: caveats
      .map((caveat) => caveat.trim())
      .filter(Boolean)
      .slice(0, 5),
  }
}
