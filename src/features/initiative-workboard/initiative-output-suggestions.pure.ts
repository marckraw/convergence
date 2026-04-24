import type {
  CreateInitiativeOutputInput,
  InitiativeOutput,
} from '@/entities/initiative'

export interface InitiativeOutputBranchFacts {
  sourceSessionId: string
  sourceSessionName: string
  branchName: string
  upstreamBranch: string | null
  remoteUrl: string | null
}

export interface InitiativeOutputSuggestion {
  id: string
  title: string
  description: string
  output: CreateInitiativeOutputInput
}

const ignoredBranchNames = new Set([
  'HEAD',
  'main',
  'master',
  'develop',
  'trunk',
])

export function buildBranchOutputSuggestions(input: {
  initiativeId: string
  facts: InitiativeOutputBranchFacts[]
  existingOutputs: InitiativeOutput[]
}): InitiativeOutputSuggestion[] {
  const existingKeys = new Set(
    input.existingOutputs.map((output) =>
      outputKey(output.kind, output.value, output.sourceSessionId),
    ),
  )
  const seenKeys = new Set<string>()
  const suggestions: InitiativeOutputSuggestion[] = []

  for (const fact of input.facts) {
    const branchName = fact.branchName.trim()
    if (!branchName || ignoredBranchNames.has(branchName)) continue

    const key = outputKey('branch', branchName, fact.sourceSessionId)
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
      output: {
        initiativeId: input.initiativeId,
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

function outputKey(
  kind: string,
  value: string,
  sourceSessionId: string | null | undefined,
): string {
  return `${kind}:${value.trim().toLowerCase()}:${sourceSessionId ?? ''}`
}
