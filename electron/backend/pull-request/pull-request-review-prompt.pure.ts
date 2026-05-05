export interface PullRequestReviewPromptInput {
  number: number
  title: string | null
  repositoryOwner: string
  repositoryName: string
  url: string | null
  baseBranch: string | null
  headBranch: string | null
  workspacePath: string
}

export function buildPullRequestReviewPrompt(
  input: PullRequestReviewPromptInput,
): string {
  const title = input.title?.trim() || 'Untitled PR'
  return [
    `Please review Pull Request #${input.number}: ${title}`,
    '',
    `Repository: ${input.repositoryOwner}/${input.repositoryName}`,
    `URL: ${input.url ?? 'Unknown'}`,
    `Base branch: ${input.baseBranch ?? 'Unknown'}`,
    `Head branch: ${input.headBranch ?? 'Unknown'}`,
    `Local workspace: ${input.workspacePath}`,
    '',
    'Review the code locally. Focus on correctness, regressions, missing tests, edge cases, maintainability, and risky behavior changes. Do not make code changes unless I explicitly ask for fixes. Return findings first, ordered by severity, with file and line references where possible. If there are no findings, say that clearly and mention any residual test or verification risk.',
  ].join('\n')
}
