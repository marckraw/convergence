export type SkillProviderId = 'codex' | 'claude-code' | 'pi'

export type SkillCatalogSource =
  | 'native-rpc'
  | 'native-cli'
  | 'filesystem'
  | 'unsupported'

export type SkillInvocationSupport =
  | 'structured-input'
  | 'native-command'
  | 'unsupported'

export type SkillActivationConfirmation = 'native-event' | 'none'

export type SkillScope =
  | 'product'
  | 'system'
  | 'global'
  | 'user'
  | 'project'
  | 'plugin'
  | 'admin'
  | 'team'
  | 'settings'
  | 'unknown'

export type SkillDependencyState =
  | 'declared'
  | 'available'
  | 'needs-auth'
  | 'needs-install'
  | 'unknown'

export interface SkillDependency {
  kind: 'mcp' | 'app' | 'tool' | 'script' | 'package' | 'other'
  name: string
  state: SkillDependencyState
  raw?: unknown
}

export type SkillWarningCode =
  | 'duplicate-name'
  | 'disabled'
  | 'missing-path'
  | 'missing-description'
  | 'invalid-frontmatter'
  | 'unsupported-path-invocation'
  | 'unknown-scope'
  | 'provider-error'

export interface SkillWarning {
  code: SkillWarningCode
  message: string
}

export interface SkillRef {
  providerId: SkillProviderId
  name: string
  path: string | null
  scope: SkillScope
  rawScope: string | null
}

export interface SkillCatalogEntry extends SkillRef {
  id: string
  providerName: string
  displayName: string
  description: string
  shortDescription: string | null
  sourceLabel: string
  enabled: boolean
  dependencies: SkillDependency[]
  warnings: SkillWarning[]
}

export interface ProviderSkillCatalog {
  providerId: SkillProviderId
  providerName: string
  catalogSource: SkillCatalogSource
  invocationSupport: SkillInvocationSupport
  activationConfirmation: SkillActivationConfirmation
  skills: SkillCatalogEntry[]
  error: string | null
}

export interface ProjectSkillCatalog {
  projectId: string
  projectName: string
  providers: ProviderSkillCatalog[]
  refreshedAt: string
}

export interface SkillCatalogOptions {
  forceReload?: boolean
}

export type SkillInvocationStatus =
  | 'selected'
  | 'sent'
  | 'confirmed'
  | 'unavailable'
  | 'failed'

export interface SkillSelection extends SkillRef {
  id: string
  providerName: string
  displayName: string
  sourceLabel: string
  status: SkillInvocationStatus
  argumentText?: string
}

export interface SkillDetailsRequest {
  projectId: string
  providerId: SkillProviderId
  skillId: string
  path: string
}

export type SkillResourceKind = 'script' | 'reference' | 'asset' | 'other'

export interface SkillResourceSummary {
  kind: SkillResourceKind
  name: string
  relativePath: string
}

export interface SkillDetails {
  skillId: string
  providerId: SkillProviderId
  path: string
  markdown: string
  sizeBytes: number
  resources: SkillResourceSummary[]
}
