import type { FC, ReactNode } from 'react'
import {
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  X,
} from 'lucide-react'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDependency,
  SkillDetails,
  SkillWarning,
} from '@/entities/skill'
import {
  ProjectOpenMenu,
  projectOpenNote,
  type ProjectOpenApp,
  type ProjectOpenAppId,
} from '@/entities/project-open'
import {
  Badge,
  Button,
  Card,
  cn,
  dialogPane,
  CopyButton,
  EmptyState,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Notice,
  SectionLabel,
  toneInk,
  Tooltip,
} from '@convergence/ui'
import { Markdown } from '@/shared/ui'
import {
  ACTIVATION_CONFIRMATION_LABELS,
  CATALOG_SOURCE_LABELS,
  DEPENDENCY_STATE_LABELS,
  DEPENDENCY_STATE_TONES,
  groupHead,
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
    return <p className="text-xs text-ink-muted">No dependencies.</p>
  }

  return (
    <div className="space-y-1.5">
      {dependencies.map((dependency, index) => (
        <div
          key={`${dependency.kind}-${dependency.name}-${index}`}
          className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-line-soft bg-surface-muted/20 px-2 py-1.5 text-xs"
        >
          <span className="min-w-0 truncate text-ink-muted">
            <span className="font-medium text-ink">{dependency.kind}</span>:{' '}
            {dependency.name}
          </span>
          <Badge
            tone={DEPENDENCY_STATE_TONES[dependency.state]}
            caps
            className="shrink-0 font-medium"
          >
            {DEPENDENCY_STATE_LABELS[dependency.state]}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function renderWarningList(warnings: SkillWarning[]) {
  if (warnings.length === 0) {
    return <p className="text-xs text-ink-muted">No warnings.</p>
  }

  return (
    <div className="space-y-1.5">
      {warnings.map((warning) => (
        <Card
          key={`${warning.code}-${warning.message}`}
          tone="warning"
          className={cn('rounded-md px-2 py-1.5 text-xs', toneInk.warning)}
        >
          <span className="font-medium">{warning.code}:</span> {warning.message}
        </Card>
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
      <EmptyState
        variant="plain"
        layout="centred"
        title="No project open"
        detail="Open a project to inspect skills."
      />
    )
  }

  if (!selectedSkill) {
    return (
      <EmptyState
        variant="plain"
        layout="centred"
        title="No skill selected"
        detail="Choose one from the list."
      />
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
    <div className={dialogPane}>
      <div className="mb-4 min-w-0">
        <div className="mb-3 flex items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge caps>{selectedSkill.providerName}</Badge>
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
                      <Copy className="size-3.5" />
                      Copy
                      <ChevronDown className="size-3" />
                    </Button>
                  }
                />
                <MenuContent align="end" className="min-w-44">
                  <MenuItem onClick={() => copy(selectedSkill.name)}>
                    <Copy className="size-3.5" />
                    Copy name
                  </MenuItem>
                  {selectedSkill.path ? (
                    <MenuItem onClick={() => copy(selectedSkill.path ?? '')}>
                      <FileText className="size-3.5" />
                      Copy SKILL.md path
                    </MenuItem>
                  ) : null}
                  {nativeInvocation ? (
                    <MenuItem onClick={() => copy(nativeInvocation)}>
                      <Code2 className="size-3.5" />
                      Copy invocation
                    </MenuItem>
                  ) : null}
                </MenuContent>
              </Menu>,
            )}
            {selectedSkill.path && onReveal ? (
              <IconButton
                label="Reveal in Finder"
                type="button"
                variant="ghost"
                onClick={onReveal}
                pending={isRevealing}
                disabled={isRevealing}
                size="sm"
              >
                <FolderOpen className="size-4" />
              </IconButton>
            ) : null}
            {/* The header's Open menu, opening the skill's folder (DLG-29). */}
            {selectedSkill.path && onOpenInEditor ? (
              <ProjectOpenMenu
                apps={editorApps ?? []}
                note={projectOpenNote({
                  apps: editorApps ?? [],
                  loading: editorAppsLoading ?? false,
                })}
                onOpen={(app) => onOpenInEditor(app.id)}
                label="Open in editor"
                tooltip="Open the skill folder in an editor"
              />
            ) : null}
            {selectedSkill.path && onOpenFile ? (
              <IconButton
                label="Open SKILL.md"
                type="button"
                variant="ghost"
                onClick={onOpenFile}
                pending={isOpeningFile}
                disabled={isOpeningFile}
                size="sm"
              >
                <ExternalLink className="size-4" />
              </IconButton>
            ) : null}
            {onClose ? (
              <IconButton
                label="Close details"
                type="button"
                variant="ghost"
                onClick={onClose}
                size="sm"
              >
                <X className="size-4" />
              </IconButton>
            ) : null}
          </div>
        </div>
        <h3 className="text-lg font-semibold break-words text-balance">
          {selectedSkill.displayName}
        </h3>
        <p className="mt-1 text-sm text-pretty text-ink-muted">
          {selectedSkill.description || 'No description.'}
        </p>
      </div>

      <div className="space-y-4">
        {selectedProvider ? (
          <Card render={<section />}>
            <SectionLabel as="h4" className="mb-2">
              Provider
            </SectionLabel>
            <div className="grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
              <span>
                Catalog:{' '}
                <span className="text-ink">
                  {CATALOG_SOURCE_LABELS[selectedProvider.catalogSource]}
                </span>
              </span>
              <span>
                Invocation:{' '}
                <span className="text-ink">
                  {
                    INVOCATION_SUPPORT_LABELS[
                      selectedProvider.invocationSupport
                    ]
                  }
                </span>
              </span>
              <span>
                Confirmation:{' '}
                <span className="text-ink">
                  {
                    ACTIVATION_CONFIRMATION_LABELS[
                      selectedProvider.activationConfirmation
                    ]
                  }
                </span>
              </span>
            </div>
            {nativeInvocation ? (
              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border border-line-soft bg-canvas/60 px-2 py-1.5">
                <SectionLabel className="shrink-0">Native</SectionLabel>
                <code className="min-w-0 flex-1 truncate text-xs text-ink">
                  {nativeInvocation}
                </code>
                <CopyButton
                  text={nativeInvocation}
                  label="Copy native invocation"
                />
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card render={<section />}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionLabel as="h4">Path</SectionLabel>
            {selectedSkill.path ? (
              <CopyButton
                text={selectedSkill.path}
                label="Copy SKILL.md path"
              />
            ) : null}
          </div>
          <p className="font-mono text-xs break-all text-ink-muted">
            {selectedSkill.path ?? 'No path reported.'}
          </p>
        </Card>

        <Card render={<section />}>
          <div className={groupHead}>
            <SectionLabel as="h4">Dependencies</SectionLabel>
            {selectedSkillHasMcpDependencies ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onOpenMcpServers}
                size="sm"
              >
                <Link2 className="size-3.5" />
                MCP servers
              </Button>
            ) : null}
          </div>
          {renderDependencyList(selectedSkill.dependencies)}
        </Card>

        <Card render={<section />}>
          <SectionLabel as="h4" className="mb-2">
            Warnings
          </SectionLabel>
          {renderWarningList(selectedSkill.warnings)}
        </Card>

        {isDetailsLoading ? (
          <EmptyState state="loading" title="Loading the skill’s details…" />
        ) : null}

        {detailsError ? <Notice tone="danger" title={detailsError} /> : null}

        {selectedDetails ? (
          <>
            <Card render={<section />}>
              <SectionLabel as="h4" className="mb-2">
                Resources
              </SectionLabel>
              {selectedDetails.resources.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedDetails.resources.map((resource) => (
                    <Badge key={`${resource.kind}-${resource.relativePath}`}>
                      {resource.kind}: {resource.relativePath}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">No resource folders.</p>
              )}
            </Card>

            <Card render={<section />} padding="md" surface="raised">
              <div className="mb-3 flex items-center gap-2 border-b border-line-soft pb-3">
                <FileText className="size-4 text-ink-muted" />
                <h4 className="text-sm font-medium">SKILL.md</h4>
                <span className="ml-auto text-xs text-ink-muted tabular-nums">
                  {selectedDetails.sizeBytes} bytes
                </span>
              </div>
              <Markdown content={selectedDetails.markdown} size="sm" />
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}
