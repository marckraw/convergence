import type {
  WorkboardProjectMappingWithProjectRecord,
  WorkboardTrackerIssueRecord,
} from './workboard.types'

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function includesNormalized(values: string[], expected: string): boolean {
  const normalizedExpected = normalize(expected)
  return values.some((value) => normalize(value) === normalizedExpected)
}

function rawString(
  issue: WorkboardTrackerIssueRecord,
  key: string,
): string | null {
  return asString(issue.raw[key])
}

function rawStringArray(
  issue: WorkboardTrackerIssueRecord,
  key: string,
): string[] {
  return asStringArray(issue.raw[key])
}

function matchesStringField(actual: string | null, expected: unknown): boolean {
  const expectedString = asString(expected)
  return (
    !expectedString ||
    (!!actual && normalize(actual) === normalize(expectedString))
  )
}

function matchesLabels(issueLabels: string[], expected: unknown): boolean {
  const labels = asStringArray(expected)
  return labels.every((label) => includesNormalized(issueLabels, label))
}

function matchesAnyLabel(issueLabels: string[], expected: unknown): boolean {
  const labels = asStringArray(expected)
  return (
    labels.length === 0 ||
    labels.some((label) => includesNormalized(issueLabels, label))
  )
}

export function mappingMatchesIssue(
  mapping: WorkboardProjectMappingWithProjectRecord,
  issue: WorkboardTrackerIssueRecord,
): boolean {
  if (!mapping.enabled || mapping.sourceId !== issue.sourceId) return false

  const matcher = mapping.matcher

  if (!matchesLabels(issue.labels, matcher.labels)) return false
  if (!matchesAnyLabel(issue.labels, matcher.anyLabel)) return false

  if (
    !matchesStringField(
      rawString(issue, 'teamKey') ?? rawString(issue, 'team'),
      matcher.teamKey ?? matcher.team,
    )
  ) {
    return false
  }

  if (
    !matchesStringField(
      rawString(issue, 'projectName') ?? rawString(issue, 'project'),
      matcher.projectName ?? matcher.project,
    )
  ) {
    return false
  }

  if (
    !matchesStringField(
      rawString(issue, 'projectKey') ?? issue.externalKey.split('-')[0] ?? null,
      matcher.projectKey,
    )
  ) {
    return false
  }

  const expectedComponents = asStringArray(matcher.components)
  if (expectedComponents.length > 0) {
    const issueComponents = rawStringArray(issue, 'components')
    if (
      !expectedComponents.every((component) =>
        includesNormalized(issueComponents, component),
      )
    ) {
      return false
    }
  }

  return true
}

export function findMappingForIssue(
  mappings: WorkboardProjectMappingWithProjectRecord[],
  issue: WorkboardTrackerIssueRecord,
): WorkboardProjectMappingWithProjectRecord | null {
  return (
    mappings
      .filter((mapping) => mappingMatchesIssue(mapping, issue))
      .sort((a, b) => b.priority - a.priority)[0] ?? null
  )
}
