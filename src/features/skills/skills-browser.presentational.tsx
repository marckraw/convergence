import type { FC, ReactNode } from 'react'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDetails,
  SkillDependency,
  SkillDependencyState,
  SkillProviderId,
  SkillScope,
  SkillWarning,
} from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import { CopyButton } from '@/shared/ui/copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Markdown } from '@/shared/ui/markdown.container'
import { cn } from '@/shared/lib/cn.pure'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  Library,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react'
import type {
  SkillBrowserFilters,
  SkillBrowserProviderGroup,
} from './skills-browser.pure'
import {
  getNativeSkillInvocationText,
  hasMcpDependencies,
} from './skills-browser.pure'

interface SkillsBrowserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  projectName: string | null
  catalog: ProjectSkillCatalog | null
  groups: SkillBrowserProviderGroup[]
  selectedSkill: SkillCatalogEntry | null
  selectedDetails: SkillDetails | null
  isCatalogLoading: boolean
  catalogError: string | null
  isDetailsLoading: boolean
  detailsError: string | null
  filters: SkillBrowserFilters
  providerOptions: Array<{ id: SkillProviderId; label: string }>
  scopeOptions: SkillScope[]
  totalSkillCount: number
  filteredSkillCount: number
  onFiltersChange: (patch: Partial<SkillBrowserFilters>) => void
  onSelectSkill: (skillId: string) => void
  onRefresh: () => void
  onOpenMcpServers: () => void
}

const SCOPE_LABELS: Record<SkillScope, string> = {
  product: 'Product',
  system: 'System',
  global: 'Global',
  user: 'User',
  project: 'Project',
  plugin: 'Plugin',
  admin: 'Admin',
  team: 'Team',
  settings: 'Settings',
  unknown: 'Unknown',
}

const DEPENDENCY_STATE_LABELS: Record<SkillDependencyState, string> = {
  declared: 'Declared',
  available: 'Available',
  'needs-auth': 'Needs auth',
  'needs-install': 'Needs install',
  unknown: 'Unknown',
}

const DEPENDENCY_STATE_CLASSES: Record<SkillDependencyState, string> = {
  declared: 'border-border/70 bg-muted/30 text-muted-foreground',
  available: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  'needs-auth': 'border-warning/20 bg-warning/10 text-warning-foreground',
  'needs-install': 'border-sky-500/20 bg-sky-500/10 text-sky-200',
  unknown: 'border-border/70 bg-muted/30 text-muted-foreground',
}

const CATALOG_SOURCE_LABELS: Record<
  ProjectSkillCatalog['providers'][number]['catalogSource'],
  string
> = {
  'native-rpc': 'Native RPC',
  'native-cli': 'Native CLI',
  filesystem: 'Filesystem',
  unsupported: 'Unsupported',
}

const INVOCATION_SUPPORT_LABELS: Record<
  ProjectSkillCatalog['providers'][number]['invocationSupport'],
  string
> = {
  'structured-input': 'Structured input',
  'native-command': 'Native command',
  unsupported: 'Unsupported',
}

const ACTIVATION_CONFIRMATION_LABELS: Record<
  ProjectSkillCatalog['providers'][number]['activationConfirmation'],
  string
> = {
  'native-event': 'Native event',
  none: 'None',
}

function renderSelectControl({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {children}
      </select>
    </label>
  )
}

function renderStatusBadge(skill: SkillCatalogEntry) {
  if (skill.enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Enabled
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <XCircle className="h-3 w-3" />
      Disabled
    </span>
  )
}

function renderWarningBadge(count: number) {
  if (count === 0) {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-foreground">
      <AlertTriangle className="h-3 w-3" />
      {count}
    </span>
  )
}

function renderDependencyList(dependencies: SkillDependency[]) {
  if (dependencies.length === 0) {
    return <p className="text-xs text-muted-foreground">No dependencies.</p>
  }

  return (
    <div className="space-y-1.5">
      {dependencies.map((dependency, index) => (
        <div
          key={`${dependency.kind}-${dependency.name}-${index}`}
          className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/20 px-2 py-1.5 text-xs"
        >
          <span className="min-w-0 truncate text-muted-foreground">
            <span className="font-medium text-foreground">
              {dependency.kind}
            </span>
            : {dependency.name}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              DEPENDENCY_STATE_CLASSES[dependency.state],
            )}
          >
            {DEPENDENCY_STATE_LABELS[dependency.state]}
          </span>
        </div>
      ))}
    </div>
  )
}

function renderWarningList(warnings: SkillWarning[]) {
  if (warnings.length === 0) {
    return <p className="text-xs text-muted-foreground">No warnings.</p>
  }

  return (
    <div className="space-y-1.5">
      {warnings.map((warning) => (
        <div
          key={`${warning.code}-${warning.message}`}
          className="rounded-md border border-warning/20 bg-warning/10 px-2 py-1.5 text-xs text-warning-foreground"
        >
          <span className="font-medium">{warning.code}:</span> {warning.message}
        </div>
      ))}
    </div>
  )
}

function renderSkillRow(
  skill: SkillCatalogEntry,
  selectedSkillId: string | null,
  onSelectSkill: (skillId: string) => void,
) {
  const selected = skill.id === selectedSkillId
  const duplicate = skill.warnings.some(
    (warning) => warning.code === 'duplicate-name',
  )

  return (
    <Button
      key={skill.id}
      type="button"
      variant="ghost"
      onClick={() => onSelectSkill(skill.id)}
      className={cn(
        'h-auto w-full justify-start rounded-lg border border-transparent px-3 py-2 text-left',
        selected
          ? 'border-primary/30 bg-primary/10 text-foreground'
          : 'hover:border-border/70 hover:bg-muted/40',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {skill.displayName}
          </span>
          {duplicate ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-foreground" />
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
          {skill.shortDescription || skill.description || 'No description.'}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {skill.sourceLabel}
          </span>
          {!skill.enabled ? (
            <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Disabled
            </span>
          ) : null}
          {renderWarningBadge(skill.warnings.length)}
        </span>
      </span>
    </Button>
  )
}

function renderProviderGroup(
  group: SkillBrowserProviderGroup,
  selectedSkillId: string | null,
  onSelectSkill: (skillId: string) => void,
) {
  return (
    <section key={group.providerId} className="border-t border-border/60 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{group.providerName}</p>
          <p className="text-xs text-muted-foreground">
            {group.skills.length} skill{group.skills.length === 1 ? '' : 's'}
          </p>
        </div>
        <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {group.catalogSource.replace('-', ' ')}
        </span>
      </div>

      {group.error ? (
        <div className="mb-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {group.error}
        </div>
      ) : null}

      {group.skills.length > 0 ? (
        <div className="space-y-2">
          {group.skills.map((skill) =>
            renderSkillRow(skill, selectedSkillId, onSelectSkill),
          )}
        </div>
      ) : group.error ? null : (
        <p className="text-sm text-muted-foreground">
          No skills matched these filters.
        </p>
      )}
    </section>
  )
}

function renderDetailsPane({
  projectName,
  catalog,
  selectedSkill,
  selectedDetails,
  isDetailsLoading,
  detailsError,
  onOpenMcpServers,
}: Pick<
  SkillsBrowserDialogProps,
  | 'projectName'
  | 'catalog'
  | 'selectedSkill'
  | 'selectedDetails'
  | 'isDetailsLoading'
  | 'detailsError'
  | 'onOpenMcpServers'
>) {
  if (!projectName) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Open a project to inspect skills.
      </div>
    )
  }

  if (!selectedSkill) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No skill selected.
      </div>
    )
  }

  const selectedProvider =
    catalog?.providers.find(
      (provider) => provider.providerId === selectedSkill.providerId,
    ) ?? null
  const nativeInvocation = getNativeSkillInvocationText(selectedSkill)
  const selectedSkillHasMcpDependencies = hasMcpDependencies(selectedSkill)

  return (
    <div className="app-scrollbar h-full min-h-0 overflow-y-auto px-6 py-5">
      <div className="mb-4 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {selectedSkill.providerName}
            </span>
            <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {SCOPE_LABELS[selectedSkill.scope]}
            </span>
            {renderStatusBadge(selectedSkill)}
            {renderWarningBadge(selectedSkill.warnings.length)}
          </div>
          <h3 className="truncate text-lg font-semibold">
            {selectedSkill.displayName}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedSkill.description || 'No description.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <CopyButton text={selectedSkill.name} label="Copy skill name" />
          {selectedSkill.path ? (
            <CopyButton text={selectedSkill.path} label="Copy SKILL.md path" />
          ) : null}
          {nativeInvocation ? (
            <CopyButton
              text={nativeInvocation}
              label="Copy native invocation"
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        {selectedProvider ? (
          <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Provider
            </p>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <span>
                Catalog:{' '}
                <span className="text-foreground">
                  {CATALOG_SOURCE_LABELS[selectedProvider.catalogSource]}
                </span>
              </span>
              <span>
                Invocation:{' '}
                <span className="text-foreground">
                  {
                    INVOCATION_SUPPORT_LABELS[
                      selectedProvider.invocationSupport
                    ]
                  }
                </span>
              </span>
              <span>
                Confirmation:{' '}
                <span className="text-foreground">
                  {
                    ACTIVATION_CONFIRMATION_LABELS[
                      selectedProvider.activationConfirmation
                    ]
                  }
                </span>
              </span>
            </div>
            {nativeInvocation ? (
              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2 py-1.5">
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Native
                </span>
                <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {nativeInvocation}
                </code>
                <CopyButton
                  text={nativeInvocation}
                  label="Copy native invocation"
                />
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Path
            </p>
            {selectedSkill.path ? (
              <CopyButton
                text={selectedSkill.path}
                label="Copy SKILL.md path"
              />
            ) : null}
          </div>
          <p
            className="break-all font-mono text-xs text-muted-foreground"
            title={selectedSkill.path ?? undefined}
          >
            {selectedSkill.path ?? 'No path reported.'}
          </p>
        </section>

        <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Dependencies
            </p>
            {selectedSkillHasMcpDependencies ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={onOpenMcpServers}
              >
                <Link2 className="h-3.5 w-3.5" />
                MCP Servers
              </Button>
            ) : null}
          </div>
          {renderDependencyList(selectedSkill.dependencies)}
        </section>

        <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Warnings
          </p>
          {renderWarningList(selectedSkill.warnings)}
        </section>

        {isDetailsLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading skill details...
          </div>
        ) : null}

        {detailsError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {detailsError}
          </div>
        ) : null}

        {selectedDetails ? (
          <>
            <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Resources
              </p>
              {selectedDetails.resources.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedDetails.resources.map((resource) => (
                    <span
                      key={`${resource.kind}-${resource.relativePath}`}
                      className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {resource.kind}: {resource.relativePath}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No resource folders.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-border/70 bg-background/60 p-4">
              <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">SKILL.md</p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedDetails.sizeBytes} bytes
                </span>
              </div>
              <Markdown content={selectedDetails.markdown} size="sm" />
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

export const SkillsBrowserDialog: FC<SkillsBrowserDialogProps> = ({
  open,
  onOpenChange,
  trigger,
  projectName,
  catalog,
  groups,
  selectedSkill,
  selectedDetails,
  isCatalogLoading,
  catalogError,
  isDetailsLoading,
  detailsError,
  filters,
  providerOptions,
  scopeOptions,
  totalSkillCount,
  filteredSkillCount,
  onFiltersChange,
  onSelectSkill,
  onRefresh,
  onOpenMcpServers,
}) => {
  const selectedSkillId = selectedSkill?.id ?? null
  const hasCatalog = Boolean(catalog)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[min(1180px,calc(100vw-2rem))] max-h-[min(86vh,820px)] p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-muted-foreground" />
            <DialogTitle>Skills</DialogTitle>
          </div>
          <DialogDescription>
            {projectName
              ? `${filteredSkillCount}/${totalSkillCount} skills in ${projectName}.`
              : 'Select a project to browse provider skills.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[390px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-b border-border/70 lg:border-r lg:border-b-0">
            <div className="shrink-0 border-b border-border/70 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={filters.query}
                  onChange={(event) =>
                    onFiltersChange({ query: event.currentTarget.value })
                  }
                  placeholder="Search skills"
                  className="pl-8"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {renderSelectControl({
                  label: 'Provider',
                  value: filters.providerId,
                  onChange: (value) =>
                    onFiltersChange({
                      providerId: value as SkillProviderId | 'all',
                    }),
                  children: (
                    <>
                      <option value="all">All providers</option>
                      {providerOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </>
                  ),
                })}
                {renderSelectControl({
                  label: 'Scope',
                  value: filters.scope,
                  onChange: (value) =>
                    onFiltersChange({ scope: value as SkillScope | 'all' }),
                  children: (
                    <>
                      <option value="all">All scopes</option>
                      {scopeOptions.map((scope) => (
                        <option key={scope} value={scope}>
                          {SCOPE_LABELS[scope]}
                        </option>
                      ))}
                    </>
                  ),
                })}
                {renderSelectControl({
                  label: 'Enabled',
                  value: filters.enabled,
                  onChange: (value) =>
                    onFiltersChange({
                      enabled: value as SkillBrowserFilters['enabled'],
                    }),
                  children: (
                    <>
                      <option value="all">All states</option>
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </>
                  ),
                })}
                {renderSelectControl({
                  label: 'Warnings',
                  value: filters.warnings,
                  onChange: (value) =>
                    onFiltersChange({
                      warnings: value as SkillBrowserFilters['warnings'],
                    }),
                  children: (
                    <>
                      <option value="all">All skills</option>
                      <option value="warnings">Warnings</option>
                    </>
                  ),
                })}
                {renderSelectControl({
                  label: 'Dependency',
                  value: filters.dependencyState,
                  onChange: (value) =>
                    onFiltersChange({
                      dependencyState:
                        value as SkillBrowserFilters['dependencyState'],
                    }),
                  children: (
                    <>
                      <option value="all">All readiness</option>
                      {Object.entries(DEPENDENCY_STATE_LABELS).map(
                        ([state, label]) => (
                          <option key={state} value={state}>
                            {label}
                          </option>
                        ),
                      )}
                    </>
                  ),
                })}
              </div>
            </div>

            <div className="app-scrollbar h-[min(52vh,520px)] overflow-y-auto p-4 lg:h-auto lg:min-h-0 lg:flex-1">
              {!projectName ? (
                <p className="text-sm text-muted-foreground">
                  Open a project to browse skills.
                </p>
              ) : catalogError && !hasCatalog ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {catalogError}
                </div>
              ) : isCatalogLoading && !hasCatalog ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading skills...
                </div>
              ) : hasCatalog && catalog?.providers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No skill-capable providers are currently available.
                </p>
              ) : groups.length > 0 ? (
                <div className="space-y-4">
                  {groups.map((group) =>
                    renderProviderGroup(group, selectedSkillId, onSelectSkill),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No skills matched these filters.
                </p>
              )}
            </div>
          </div>

          {renderDetailsPane({
            projectName,
            catalog,
            selectedSkill,
            selectedDetails,
            isDetailsLoading,
            detailsError,
            onOpenMcpServers,
          })}
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={!projectName || isCatalogLoading}
          >
            <RefreshCw
              className={cn('h-4 w-4', isCatalogLoading && 'animate-spin')}
            />
            Refresh
          </Button>
          {selectedSkill?.path ? (
            <div className="mr-auto hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{selectedSkill.path}</span>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
