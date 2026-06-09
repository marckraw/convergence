import type {
  CodeReviewCacheIdentity,
  CodeReviewTarget,
} from '../code-review/code-review.types'
import type {
  CodeReviewGuideDraft,
  CodeReviewGuideFile,
  CodeReviewGuideGenerator,
  CodeReviewGuideRiskLevel,
  CodeReviewGuideSection,
  CodeReviewGuideStatus,
} from './code-review-guide.types'
import type {
  RemoteCodeReviewDaemonHealth,
  RemoteCodeReviewDaemonMeta,
  RemoteCodeReviewDaemonProviderId,
  RemoteCodeReviewFileEntry,
  RemoteCodeReviewGuide,
  RemoteCodeReviewGuideGenerateInput,
  RemoteCodeReviewGuideGenerateResult,
  RemoteCodeReviewGuideRequestBody,
  RemoteCodeReviewGuideSummary,
  RemotePullRequestMetadata,
} from './remote-daemon-guide.types'

export type RemoteDaemonBaseUrlResolution =
  | { ok: true; baseUrl: string }
  | { ok: false; reason: 'missing' | 'invalid' }

export type RemoteCodeReviewGuideTargetResolution =
  | { ok: true; repository: string; pullRequestNumber: number }
  | {
      ok: false
      reason:
        | 'not-remote-pull-request'
        | 'missing-pull-request-number'
        | 'missing-pull-request-url'
        | 'unsupported-pull-request-url'
    }

export type RemoteDaemonGenerationModelResolution =
  | { ok: true; model: string; changed: boolean }
  | {
      ok: false
      reason:
        | 'missing-preferred-model'
        | 'missing-provider'
        | 'provider-unavailable'
        | 'provider-unauthenticated'
        | 'missing-provider-models'
    }

export function resolveRemoteDaemonBaseUrl(
  value: string | null | undefined,
): RemoteDaemonBaseUrlResolution {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return { ok: false, reason: 'missing' }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'invalid' }
    }

    parsed.hash = ''
    parsed.search = ''
    const normalized = parsed.toString().replace(/\/+$/, '')
    return { ok: true, baseUrl: normalized }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

export function buildRemoteDaemonUrl(baseUrl: string, path: string): string {
  const resolved = resolveRemoteDaemonBaseUrl(baseUrl)
  if (!resolved.ok) {
    throw new Error(
      resolved.reason === 'missing'
        ? 'Remote daemon base URL is not configured.'
        : 'Remote daemon base URL must be an HTTP(S) URL.',
    )
  }

  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error('Remote daemon endpoint path must be absolute.')
  }

  const base = `${resolved.baseUrl}/`
  const relativePath = path.replace(/^\/+/, '')
  return new URL(relativePath, base).toString()
}

export function mapProviderIdToRemoteDaemonProviderId(
  providerId: string,
): RemoteCodeReviewDaemonProviderId | null {
  switch (providerId) {
    case 'claude-code':
      return 'claude'
    case 'codex':
    case 'cursor':
    case 'gemini':
      return providerId
    default:
      return null
  }
}

export function resolveRemoteCodeReviewGuideTarget(
  target: CodeReviewTarget,
): RemoteCodeReviewGuideTargetResolution {
  if (target.source !== 'pull-request' || target.workspaceId) {
    return { ok: false, reason: 'not-remote-pull-request' }
  }

  const pullRequestNumber = target.pullRequestNumber
  if (
    typeof pullRequestNumber !== 'number' ||
    !Number.isInteger(pullRequestNumber) ||
    pullRequestNumber < 1
  ) {
    return { ok: false, reason: 'missing-pull-request-number' }
  }

  const pullRequestUrl = target.pullRequestUrl?.trim() ?? ''
  if (!pullRequestUrl) {
    return { ok: false, reason: 'missing-pull-request-url' }
  }

  const repository = githubRepositoryFromPullRequestUrl(pullRequestUrl)
  if (!repository) {
    return { ok: false, reason: 'unsupported-pull-request-url' }
  }

  return {
    ok: true,
    repository,
    pullRequestNumber,
  }
}

export function resolveRemoteDaemonGenerationModel(input: {
  meta: Pick<RemoteCodeReviewDaemonMeta, 'providers'>
  provider: RemoteCodeReviewDaemonProviderId
  preferredModel: string
}): RemoteDaemonGenerationModelResolution {
  const preferredModel = input.preferredModel.trim()
  if (!preferredModel) {
    return { ok: false, reason: 'missing-preferred-model' }
  }

  const provider = findRemoteProvider(input.meta.providers, input.provider)
  if (!provider) {
    return { ok: false, reason: 'missing-provider' }
  }
  if (provider.available === false) {
    return { ok: false, reason: 'provider-unavailable' }
  }
  if (provider.authenticated === false) {
    return { ok: false, reason: 'provider-unauthenticated' }
  }
  if (provider.models.length === 0) {
    return { ok: false, reason: 'missing-provider-models' }
  }

  if (provider.models.includes(preferredModel)) {
    return { ok: true, model: preferredModel, changed: false }
  }

  const fallback =
    preferredRemoteProviderModel(input.provider, provider.models) ??
    provider.models[0]
  return { ok: true, model: fallback, changed: true }
}

export function buildRemoteCodeReviewGuideRequestBody(
  input: RemoteCodeReviewGuideGenerateInput,
): RemoteCodeReviewGuideRequestBody {
  const repository = input.repository.trim()
  const model = input.model.trim()
  const effort = input.effort?.trim()

  if (!repository) {
    throw new Error('Remote guide generation requires a repository URL.')
  }
  if (
    !Number.isInteger(input.pullRequestNumber) ||
    input.pullRequestNumber < 1
  ) {
    throw new Error('Remote guide generation requires a pull request number.')
  }
  if (!model) {
    throw new Error('Remote guide generation requires a model.')
  }

  return {
    source: {
      repository,
      pullRequest: {
        number: input.pullRequestNumber,
      },
    },
    provider: input.provider,
    model,
    ...(effort ? { effort } : {}),
    ...(input.force === undefined ? {} : { force: input.force }),
  }
}

export function parseRemoteDaemonHealth(
  value: unknown,
): RemoteCodeReviewDaemonHealth {
  const obj = requiredRecord(value, 'daemon health')
  const providers = parseBooleanRecord(obj.providers, 'providers')

  return {
    status: requireLiteral(obj.status, 'ok', 'status'),
    version: requireString(obj.version, 'version'),
    apiVersion: requireString(obj.apiVersion, 'apiVersion'),
    uptime: requireNumber(obj.uptime, 'uptime'),
    activeSessions: requireNumber(obj.activeSessions, 'activeSessions'),
    providers,
  }
}

export function parseRemoteDaemonMeta(
  value: unknown,
): RemoteCodeReviewDaemonMeta {
  const obj = requiredRecord(value, 'daemon metadata')
  const deployment = requiredRecord(obj.deployment, 'deployment')
  const git = requiredRecord(obj.git, 'git')
  const runtime = requiredRecord(obj.runtime, 'runtime')

  if (!Array.isArray(obj.providers)) {
    throw new Error('Invalid daemon metadata: providers')
  }

  return {
    name: requireString(obj.name, 'name'),
    version: requireString(obj.version, 'version'),
    apiVersion: requireString(obj.apiVersion, 'apiVersion'),
    deployment: {
      mode: requireString(deployment.mode, 'deployment.mode'),
      sharedAcrossTeams: requireBoolean(
        deployment.sharedAcrossTeams,
        'deployment.sharedAcrossTeams',
      ),
    },
    providers: obj.providers,
    git: {
      githubAuthenticated: requireBoolean(
        git.githubAuthenticated,
        'git.githubAuthenticated',
      ),
    },
    runtime: {
      activeSessions: requireNumber(
        runtime.activeSessions,
        'runtime.activeSessions',
      ),
      maxConcurrentAgents: requireNumber(
        runtime.maxConcurrentAgents,
        'runtime.maxConcurrentAgents',
      ),
      uptimeSeconds: requireNumber(
        runtime.uptimeSeconds,
        'runtime.uptimeSeconds',
      ),
      host: requireString(runtime.host, 'runtime.host'),
      port: requireNumber(runtime.port, 'runtime.port'),
    },
  }
}

export function parseRemoteCodeReviewGuideGenerateResult(
  value: unknown,
): RemoteCodeReviewGuideGenerateResult {
  const obj = requiredRecord(value, 'remote guide result')
  const pullRequest = parsePullRequest(obj.pullRequest)
  const summary = parseSummary(obj.summary)
  const guide = parseRemoteGuide(obj.guide)

  return {
    pullRequest,
    summary,
    guide,
    guideDraft: mapRemoteGuideToCodeReviewGuideDraft(guide),
  }
}

export function mapRemoteGuideToCodeReviewGuideDraft(
  guide: RemoteCodeReviewGuide,
): CodeReviewGuideDraft {
  return {
    overview: guide.overview,
    generatedBy: guide.generatedBy,
    sections: guide.sections,
  }
}

function findRemoteProvider(
  providers: unknown[],
  providerId: RemoteCodeReviewDaemonProviderId,
): {
  available: boolean | null
  authenticated: boolean | null
  models: string[]
} | null {
  for (const value of providers) {
    if (typeof value !== 'object' || value === null) continue
    const obj = value as Record<string, unknown>
    if (obj.id !== providerId) continue

    return {
      available: typeof obj.available === 'boolean' ? obj.available : null,
      authenticated:
        typeof obj.authenticated === 'boolean' ? obj.authenticated : null,
      models: parseRemoteProviderModelSlugs(obj.models),
    }
  }

  return null
}

function parseRemoteProviderModelSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((model) => {
    if (typeof model !== 'object' || model === null) return []
    const slug = (model as { slug?: unknown }).slug
    return typeof slug === 'string' && slug.trim().length > 0
      ? [slug.trim()]
      : []
  })
}

function preferredRemoteProviderModel(
  provider: RemoteCodeReviewDaemonProviderId,
  models: string[],
): string | null {
  const orderedPreferences: Partial<
    Record<RemoteCodeReviewDaemonProviderId, string[]>
  > = {
    claude: [
      'fable',
      'claude-fable-5',
      'best',
      'opus',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'sonnet',
      'claude-sonnet-4-6',
    ],
    codex: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'o3'],
  }

  return (
    orderedPreferences[provider]?.find((model) => models.includes(model)) ??
    null
  )
}

function githubRepositoryFromPullRequestUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null
    }
    if (parsed.hostname.toLowerCase() !== 'github.com') return null

    const segments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (segments.length < 4 || segments[2] !== 'pull') return null

    const owner = segments[0]
    const repo = segments[1].replace(/\.git$/i, '')
    const pullRequestNumber = Number(segments[3])
    if (!owner || !repo || !Number.isInteger(pullRequestNumber)) return null

    return `https://github.com/${owner}/${repo}`
  } catch {
    return null
  }
}

function parseRemoteGuide(value: unknown): RemoteCodeReviewGuide {
  const obj = requiredRecord(value, 'remote guide')
  const provider = parseProvider(obj.provider)
  const sections = parseSections(obj.sections)

  return {
    id: requireString(obj.id, 'guide.id'),
    repository: requireString(obj.repository, 'guide.repository'),
    pullRequestNumber: requireNumber(
      obj.pullRequestNumber,
      'guide.pullRequestNumber',
    ),
    targetId: requireString(obj.targetId, 'guide.targetId'),
    mode: requireLiteral(obj.mode, 'pull-request', 'guide.mode'),
    cacheIdentity: parseCacheIdentity(obj.cacheIdentity),
    provider,
    model: requireString(obj.model, 'guide.model'),
    effort: optionalString(obj.effort, 'guide.effort'),
    status: parseStatus(obj.status),
    overview: requireString(obj.overview, 'guide.overview'),
    generatedBy: parseGenerator(obj.generatedBy),
    sections,
    error: optionalString(obj.error, 'guide.error'),
    pullRequest: parsePullRequest(obj.pullRequest),
    summary: parseSummary(obj.summary),
    createdAt: requireString(obj.createdAt, 'guide.createdAt'),
    updatedAt: requireString(obj.updatedAt, 'guide.updatedAt'),
  }
}

function parseSummary(value: unknown): RemoteCodeReviewGuideSummary {
  const obj = requiredRecord(value, 'summary')
  return {
    cacheIdentity: parseCacheIdentity(obj.cacheIdentity),
    files: parseFileEntries(obj.files),
  }
}

function parsePullRequest(value: unknown): RemotePullRequestMetadata {
  const obj = requiredRecord(value, 'pullRequest')
  const state = obj.state
  if (
    state !== 'open' &&
    state !== 'closed' &&
    state !== 'merged' &&
    state !== 'unknown'
  ) {
    throw new Error('Invalid pull request: state')
  }

  return {
    provider: requireLiteral(obj.provider, 'github', 'pullRequest.provider'),
    repositoryOwner: requireString(
      obj.repositoryOwner,
      'pullRequest.repositoryOwner',
    ),
    repositoryName: requireString(
      obj.repositoryName,
      'pullRequest.repositoryName',
    ),
    number: requireNumber(obj.number, 'pullRequest.number'),
    title: optionalString(obj.title, 'pullRequest.title'),
    url: requireString(obj.url, 'pullRequest.url'),
    state,
    baseBranch: requireString(obj.baseBranch, 'pullRequest.baseBranch'),
    headBranch: requireString(obj.headBranch, 'pullRequest.headBranch'),
    headRepositoryOwner: optionalString(
      obj.headRepositoryOwner,
      'pullRequest.headRepositoryOwner',
    ),
    headRepositoryName: optionalString(
      obj.headRepositoryName,
      'pullRequest.headRepositoryName',
    ),
  }
}

function parseCacheIdentity(value: unknown): CodeReviewCacheIdentity {
  const obj = requiredRecord(value, 'cacheIdentity')
  return {
    comparisonRef: optionalString(
      obj.comparisonRef,
      'cacheIdentity.comparisonRef',
    ),
    comparisonPoint: optionalString(
      obj.comparisonPoint,
      'cacheIdentity.comparisonPoint',
    ),
    workingTreeVersionToken: requireString(
      obj.workingTreeVersionToken,
      'cacheIdentity.workingTreeVersionToken',
    ),
  }
}

function parseSections(value: unknown): CodeReviewGuideSection[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid guide sections')
  }

  return value.map((item, index) => parseSection(item, index))
}

function parseSection(value: unknown, index: number): CodeReviewGuideSection {
  const obj = requiredRecord(value, `sections.${index}`)
  return {
    id: requireString(obj.id, `sections.${index}.id`),
    title: requireString(obj.title, `sections.${index}.title`),
    summary: requireString(obj.summary, `sections.${index}.summary`),
    narrative: requireString(obj.narrative, `sections.${index}.narrative`),
    riskLevel: parseRiskLevel(obj.riskLevel, `sections.${index}.riskLevel`),
    riskRationale: requireString(
      obj.riskRationale,
      `sections.${index}.riskRationale`,
    ),
    checklist: parseStringArray(obj.checklist, `sections.${index}.checklist`),
    files: parseGuideFiles(obj.files, `sections.${index}.files`),
  }
}

function parseGuideFiles(value: unknown, field: string): CodeReviewGuideFile[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}`)
  }

  return value.map((item, index) => {
    const obj = requiredRecord(item, `${field}.${index}`)
    return {
      path: requireString(obj.path, `${field}.${index}.path`),
      status: requireString(obj.status, `${field}.${index}.status`),
      reason: requireString(obj.reason, `${field}.${index}.reason`),
      hunkHints: parseStringArray(obj.hunkHints, `${field}.${index}.hunkHints`),
    }
  })
}

function parseFileEntries(value: unknown): RemoteCodeReviewFileEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid summary files')
  }

  return value.map((item, index) => {
    const obj = requiredRecord(item, `summary.files.${index}`)
    const previousFile = optionalString(
      obj.previousFile,
      `summary.files.${index}.previousFile`,
    )

    return {
      status: requireString(obj.status, `summary.files.${index}.status`),
      file: requireString(obj.file, `summary.files.${index}.file`),
      ...(previousFile ? { previousFile } : {}),
    }
  })
}

function parseProvider(value: unknown): RemoteCodeReviewDaemonProviderId {
  if (
    value === 'claude' ||
    value === 'codex' ||
    value === 'cursor' ||
    value === 'gemini'
  ) {
    return value
  }
  throw new Error('Invalid remote guide provider')
}

function parseStatus(value: unknown): CodeReviewGuideStatus {
  if (value === 'ready' || value === 'failed') return value
  throw new Error('Invalid remote guide status')
}

function parseGenerator(value: unknown): CodeReviewGuideGenerator {
  if (value === 'deterministic' || value === 'agent') return value
  throw new Error('Invalid remote guide generator')
}

function parseRiskLevel(
  value: unknown,
  field: string,
): CodeReviewGuideRiskLevel {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  throw new Error(`Invalid ${field}`)
}

function parseBooleanRecord(
  value: unknown,
  field: string,
): Record<string, boolean> {
  const obj = requiredRecord(value, field)
  const entries: Array<[string, boolean]> = []
  for (const [key, item] of Object.entries(obj)) {
    if (typeof item !== 'boolean') {
      throw new Error(`Invalid ${field}.${key}`)
    }
    entries.push([key, item])
  }
  return Object.fromEntries(entries)
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}`)
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`Invalid ${field}.${index}`)
    }
    return item
  })
}

function requiredRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error(`Invalid ${field}`)
}

function requireString(value: unknown, field: string): string {
  if (typeof value === 'string') return value
  throw new Error(`Invalid ${field}`)
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  throw new Error(`Invalid ${field}`)
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error(`Invalid ${field}`)
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value
  throw new Error(`Invalid ${field}`)
}

function requireLiteral<T extends string>(
  value: unknown,
  literal: T,
  field: string,
): T {
  if (value === literal) return literal
  throw new Error(`Invalid ${field}`)
}
