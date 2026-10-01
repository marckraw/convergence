import type { FC, ReactNode } from 'react'
import {
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Loader2,
  X,
} from 'lucide-react'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDependency,
  SkillDetails,
  SkillWarning,
} from '@/entities/skill'
import type { ProjectOpenApp, ProjectOpenAppId } from '@/entities/project-open'
import {
  Button,
  cn,
  CopyButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  IconButton,
  Tooltip,
} from '@convergence/ui'
import { Markdown } from '@/shared/ui/markdown.container'
import {
  ACTIVATION_CONFIRMATION_LABELS,
  CATALOG_SOURCE_LABELS,
  DEPENDENCY_STATE_CLASSES,
  DEPENDENCY_STATE_LABELS,
  INVOCATION_SUPPORT_LABELS,
} from './skills-browser.styles'
import {
  renderScopeChip,
  renderStatusBadge,
  renderWarningBadge,
} from './skills-chips.presentational'
import {
  getNativeSkillInvocationText,
  hasMcpDependencies,
} from './skills-browser.pure'

interface SkillDetailPaneProps {
  projectName: string | null
  catalog: ProjectSkillCatalog | null
  selectedSkill: SkillCatalogEntry | null
  selectedDetails: SkillDetails | null
  isDetailsLoading: boolean
  detailsError: string | null
  onOpenMcpServers: () => void
  /** Reveal the SKILL.md in the OS file manager. */
  onReveal?: () => void
  /** Open the SKILL.md in the default editor. */
  onOpenFile?: () => void
  /** True while the reveal IPC call is in flight (shows a spinner). */
  isRevealing?: boolean
  /** True while the open-file IPC call is in flight (shows a spinner). */
  isOpeningFile?: boolean
  /** Installed editors for the "Open in editor" menu. */
  editorApps?: ProjectOpenApp[]
  editorAppsLoading?: boolean
  onOpenInEditor?: (appId: ProjectOpenAppId) => void
  /** When provided, renders as a dismissable slide-over (grid/overview). */
  onClose?: () => void
}

/** Wraps an action in a hover tooltip so each icon's purpose is legible. */
function withTooltip(label: string, node: ReactNode) {
  return (
    <Tooltip label={label}>
      <span className="inline-flex">{node}</span>
    </Tooltip>
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

export const SkillDetailPane: FC<SkillDetailPaneProps> = ({
  projectName,
  catalog,
  selectedSkill,
  selectedDetails,
  isDetailsLoading,
  detailsError,
  onOpenMcpServers,
  onReveal,
  onOpenFile,
  isRevealing,
  isOpeningFile,
  editorApps,
  editorAppsLoading,
  onOpenInEditor,
  onClose,
}) => {
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
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="app-scrollbar h-full min-h-0 overflow-y-auto px-6 py-5">
      <div className="mb-4 min-w-0">
        <div className="mb-3 flex items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {selectedSkill.providerName}
            </span>
            {renderScopeChip(selectedSkill.scope)}
            {renderStatusBadge(selectedSkill.enabled)}
            {renderWarningBadge(selectedSkill.warnings.length)}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {withTooltip(
              'Copy name, path, or invocation',
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Copy"
                      size="sm"
                      className="gap-1"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  }
                />
                <MenuContent align="end" className="min-w-44">
                  <MenuItem onClick={() => copy(selectedSkill.name)}>
                    <Copy className="h-3.5 w-3.5" />
                    Copy name
                  </MenuItem>
                  {selectedSkill.path ? (
                    <MenuItem onClick={() => copy(selectedSkill.path ?? '')}>
                      <FileText className="h-3.5 w-3.5" />
                      Copy SKILL.md path
                    </MenuItem>
                  ) : null}
                  {nativeInvocation ? (
                    <MenuItem onClick={() => copy(nativeInvocation)}>
                      <Code2 className="h-3.5 w-3.5" />
                      Copy invocation
                    </MenuItem>
                  ) : null}
                </MenuContent>
              </Menu>,
            )}
            {selectedSkill.path && onReveal
              ? withTooltip(
                  'Reveal in Finder',
                  <IconButton
                    label="Reveal in Finder"
                    type="button"
                    variant="ghost"
                    onClick={onReveal}
                    disabled={isRevealing}
                    size="sm"
                  >
                    {isRevealing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FolderOpen className="h-4 w-4" />
                    )}
                  </IconButton>,
                )
              : null}
            {selectedSkill.path && onOpenInEditor
              ? withTooltip(
                  'Open the skill folder in an editor',
                  <Menu>
                    <MenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Open in editor"
                          size="sm"
                          className="gap-1"
                        >
                          <Code2 className="h-3.5 w-3.5" />
                          Open
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      }
                    />
                    <MenuContent align="end" className="min-w-40">
                      {editorAppsLoading ? (
                        <MenuItem disabled>Detecting apps...</MenuItem>
                      ) : (editorApps?.length ?? 0) === 0 ? (
                        <MenuItem disabled>No editors found</MenuItem>
                      ) : (
                        editorApps?.map((app) => {
                          const Icon =
                            app.kind === 'file-manager' ? Folder : Code2
                          return (
                            <MenuItem
                              key={app.id}
                              onClick={() => onOpenInEditor(app.id)}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {app.label}
                            </MenuItem>
                          )
                        })
                      )}
                    </MenuContent>
                  </Menu>,
                )
              : null}
            {selectedSkill.path && onOpenFile
              ? withTooltip(
                  'Open SKILL.md',
                  <IconButton
                    label="Open SKILL.md"
                    type="button"
                    variant="ghost"
                    onClick={onOpenFile}
                    disabled={isOpeningFile}
                    size="sm"
                  >
                    {isOpeningFile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                  </IconButton>,
                )
              : null}
            {onClose
              ? withTooltip(
                  'Close',
                  <IconButton
                    label="Close details"
                    type="button"
                    variant="ghost"
                    onClick={onClose}
                    size="sm"
                  >
                    <X className="h-4 w-4" />
                  </IconButton>,
                )
              : null}
          </div>
        </div>
        <h3 className="text-lg font-semibold break-words text-balance">
          {selectedSkill.displayName}
        </h3>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {selectedSkill.description || 'No description.'}
        </p>
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
                variant="secondary"
                onClick={onOpenMcpServers}
                size="sm"
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
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
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
