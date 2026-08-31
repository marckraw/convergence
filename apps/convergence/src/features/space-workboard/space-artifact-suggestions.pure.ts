import type { CreateSpaceArtifactInput, SpaceArtifact } from '@/entities/space'

export interface SpaceArtifactBranchFacts {
  sourceSessionId: string
  sourceSessionName: string
  branchName: string
  upstreamBranch: string | null
  remoteUrl: string | null
}

export interface SpaceArtifactSuggestion {
  id: string
  title: string
  description: string
  artifact: CreateSpaceArtifactInput
}

const ignoredBranchNames = new Set([
  'HEAD',
  'main',
  'master',
  'develop',
  'trunk',
])

export function buildBranchArtifactSuggestions(input: {
  spaceId: string
  facts: SpaceArtifactBranchFacts[]
  existingArtifacts: SpaceArtifact[]
}): SpaceArtifactSuggestion[] {
  const existingKeys = new Set(
    input.existingArtifacts.map((artifact) =>
      artifactKey(artifact.kind, artifact.value, artifact.sourceSessionId),
    ),
  )
  const seenKeys = new Set<string>()
  const suggestions: SpaceArtifactSuggestion[] = []

  for (const fact of input.facts) {
    const branchName = fact.branchName.trim()
    if (!branchName || ignoredBranchNames.has(branchName)) continue

    const key = artifactKey('branch', branchName, fact.sourceSessionId)
    if (existingKeys.has(key) || seenKeys.has(key)) continue
    seenKeys.add(key)

    const upstreamLabel = fact.upstreamBranch
      ? ` tracking ${fact.upstreamBranch}`
      : ''
    const remoteLabel = fact.remoteUrl ? ` from ${fact.remoteUrl}` : ''

    suggestions.push({
      id: `branch:${fact.sourceSessionId}:${branchName}`,
      title: `Branch ${branchName}`,
      description: `${fact.sourceSessionName}${upstreamLabel}${remoteLabel}`,
      artifact: {
        spaceId: input.spaceId,
        kind: 'branch',
        label: `Branch ${branchName}`,
        value: branchName,
        sourceSessionId: fact.sourceSessionId,
        status: 'in-progress',
      },
    })
  }

  return suggestions
}

function artifactKey(
  kind: string,
  value: string,
  sourceSessionId: string | null | undefined,
): string {
  return `${kind}:${value.trim().toLowerCase()}:${sourceSessionId ?? ''}`
}
