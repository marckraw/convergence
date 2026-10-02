import { useRef, type FC, type ReactElement, type ReactNode } from 'react'
import {
  LayoutDashboard,
  LayoutGrid,
  Library,
  List as ListIcon,
  RefreshCw,
} from 'lucide-react'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDetails,
  SkillProviderId,
} from '@/entities/skill'
import type { ProjectOpenApp, ProjectOpenAppId } from '@/entities/project-open'
import {
  dialogPane,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Field,
  FieldLabel,
  IconButton,
  SearchField,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Spinner,
} from '@convergence/ui'
import type {
  SkillBrowserFilters,
  SkillBrowserProviderGroup,
  SkillGridGroup,
  SkillGroupBy,
} from './skills-browser.pure'
import { DEPENDENCY_STATE_LABELS, SKILL_ORIGINS } from './skills-browser.styles'
import type { SkillsOverview } from './skills-overview.pure'
import { SkillsOverviewView } from './skills-overview.presentational'
import { SkillsGrid } from './skills-grid.presentational'
import { SkillsListPane } from './skills-list.presentational'
import { SkillDetailPane } from './skills-detail.presentational'

export type SkillsViewMode = 'overview' | 'grid' | 'list'

interface SkillsBrowserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  projectName: string | null
  catalog: ProjectSkillCatalog | null
  viewMode: SkillsViewMode
  groupBy: SkillGroupBy
  groups: SkillBrowserProviderGroup[]
  gridGroups: SkillGridGroup[]
  overview: SkillsOverview
  selectedSkill: SkillCatalogEntry | null
  selectedDetails: SkillDetails | null
  isCatalogLoading: boolean
  loadingProviderNames: string[]
  catalogError: string | null
  isDetailsLoading: boolean
  detailsError: string | null
  isDetailOpen: boolean
  filters: SkillBrowserFilters
  providerOptions: Array<{ id: SkillProviderId; label: string }>
  totalSkillCount: number
  filteredSkillCount: number
  onViewModeChange: (mode: SkillsViewMode) => void
  onGroupByChange: (groupBy: SkillGroupBy) => void
  onFiltersChange: (patch: Partial<SkillBrowserFilters>) => void
  onJumpToGrid: (patch: Partial<SkillBrowserFilters>) => void
  onSelectSkill: (skillId: string) => void
  onCloseDetail: () => void
  onRefresh: () => void
  onOpenMcpServers: () => void
  onRevealSkill: () => void
  onOpenSkillFile: () => void
  isRevealing: boolean
  isOpeningFile: boolean
  editorApps: ProjectOpenApp[]
  editorAppsLoading: boolean
  onOpenInEditor: (appId: ProjectOpenAppId) => void
}

const VIEW_MODES: Array<{
  id: SkillsViewMode
  label: string
  icon: typeof LayoutGrid
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'grid', label: 'Grid', icon: LayoutGrid },
  { id: 'list', label: 'List', icon: ListIcon },
]

const GROUP_BY_OPTIONS: Array<{ value: SkillGroupBy; label: string }> = [
  { value: 'provider', label: 'Provider' },
  { value: 'scope', label: 'Scope' },
  { value: 'readiness', label: 'Readiness' },
  { value: 'none', label: 'None' },
]

function renderViewSwitcher(
  value: SkillsViewMode,
  onChange: (mode: SkillsViewMode) => void,
) {
  return (
    <SegmentedControl
      aria-label="View"
      size="sm"
      value={value}
      onValueChange={(next: SkillsViewMode) => onChange(next)}
    >
      {VIEW_MODES.map((mode) => {
        const Icon = mode.icon
        return (
          <SegmentedControlItem key={mode.id} value={mode.id}>
            <Icon aria-hidden />
            {mode.label}
          </SegmentedControlItem>
        )
      })}
    </SegmentedControl>
  )
}

/**
 * A filter of the toolbar: a short fixed list (R9), named by a caption you
 * can see, as the Prompt library's filters are (DLG-21).
 */
function renderFilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <Field className="w-40 gap-1">
      <FieldLabel variant="caption" nativeLabel={false} render={<div />}>
        {label}
      </FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => onChange(next)}
      >
        <SelectTrigger size="md" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function renderFilterToolbar({
  viewMode,
  groupBy,
  filters,
  providerOptions,
  onGroupByChange,
  onFiltersChange,
}: Pick<
  SkillsBrowserDialogProps,
  | 'viewMode'
  | 'groupBy'
  | 'filters'
  | 'providerOptions'
  | 'onGroupByChange'
  | 'onFiltersChange'
>) {
  return (
    <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-line-soft px-6 py-3">
      <SearchField
        size="lg"
        value={filters.query}
        onChange={(event) =>
          onFiltersChange({ query: event.currentTarget.value })
        }
        onClear={() => onFiltersChange({ query: '' })}
        clearLabel="Clear the skill search"
        placeholder="Search skills"
        aria-label="Search skills"
        className="min-w-50 flex-1"
      />

      {renderFilterSelect({
        label: 'Origin',
        value: filters.origin,
        onChange: (value) =>
          onFiltersChange({ origin: value as SkillBrowserFilters['origin'] }),
        options: [
          { value: 'all', label: 'All origins' },
          ...SKILL_ORIGINS.map((origin) => ({
            value: origin.id,
            label: origin.label,
          })),
        ],
      })}
      {renderFilterSelect({
        label: 'Provider',
        value: filters.providerId,
        onChange: (value) =>
          onFiltersChange({ providerId: value as SkillProviderId | 'all' }),
        options: [
          { value: 'all', label: 'All providers' },
          ...providerOptions.map((provider) => ({
            value: provider.id,
            label: provider.label,
          })),
        ],
      })}
      {renderFilterSelect({
        label: 'Status',
        value: filters.enabled,
        onChange: (value) =>
          onFiltersChange({ enabled: value as SkillBrowserFilters['enabled'] }),
        options: [
          { value: 'all', label: 'All states' },
          { value: 'enabled', label: 'Enabled' },
          { value: 'disabled', label: 'Disabled' },
        ],
      })}
      {renderFilterSelect({
        label: 'Warnings',
        value: filters.warnings,
        onChange: (value) =>
          onFiltersChange({
            warnings: value as SkillBrowserFilters['warnings'],
          }),
        options: [
          { value: 'all', label: 'All skills' },
          { value: 'warnings', label: 'With warnings' },
          { value: 'duplicate-name', label: 'Duplicate name' },
          {
            value: 'unsupported-path-invocation',
            label: 'Unsupported invocation',
          },
          { value: 'missing-description', label: 'Missing description' },
          { value: 'invalid-frontmatter', label: 'Invalid frontmatter' },
        ],
      })}
      {renderFilterSelect({
        label: 'Dependency',
        value: filters.dependencyState,
        onChange: (value) =>
          onFiltersChange({
            dependencyState: value as SkillBrowserFilters['dependencyState'],
          }),
        options: [
          { value: 'all', label: 'All readiness' },
          ...Object.entries(DEPENDENCY_STATE_LABELS).map(([state, label]) => ({
            value: state,
            label,
          })),
        ],
      })}

      {viewMode === 'grid' ? (
        <div className="ml-auto">
          {renderFilterSelect({
            label: 'Group by',
            value: groupBy,
            onChange: (value) => onGroupByChange(value as SkillGroupBy),
            options: GROUP_BY_OPTIONS,
          })}
        </div>
      ) : null}
    </div>
  )
}

function renderCatalogPlaceholder({
  projectName,
  catalog,
  catalogError,
  isCatalogLoading,
  onRefresh,
}: Pick<
  SkillsBrowserDialogProps,
  'projectName' | 'catalog' | 'catalogError' | 'isCatalogLoading' | 'onRefresh'
>): ReactNode | null {
  const hasCatalog = Boolean(catalog)
  if (!projectName) {
    return (
      <EmptyState
        title="No project open"
        detail="Open a project to browse skills."
      />
    )
  }
  if (catalogError && !hasCatalog) {
    return (
      <EmptyState
        state="failed"
        title="Couldn't read the skills"
        detail={catalogError}
        onRetry={onRefresh}
        retrying={isCatalogLoading}
      />
    )
  }
  if (isCatalogLoading && !hasCatalog) {
    return <EmptyState state="loading" title="Loading skills…" />
  }
  if (hasCatalog && catalog?.providers.length === 0 && !isCatalogLoading) {
    return (
      <EmptyState
        title="No skill-capable providers"
        detail="None of the installed providers lists skills."
      />
    )
  }
  return null
}

export const SkillsBrowserDialog: FC<SkillsBrowserDialogProps> = (props) => {
  // The grid's area: a skill's details slide in over it, not over the window.
  const detailArea = useRef<HTMLDivElement>(null)
  const {
    open,
    onOpenChange,
    trigger,
    projectName,
    catalog,
    viewMode,
    groups,
    gridGroups,
    groupBy,
    overview,
    selectedSkill,
    selectedDetails,
    isCatalogLoading,
    catalogError,
    isDetailsLoading,
    detailsError,
    isDetailOpen,
    loadingProviderNames,
    totalSkillCount,
    filteredSkillCount,
    onViewModeChange,
    onSelectSkill,
    onCloseDetail,
    onJumpToGrid,
    onRefresh,
    onOpenMcpServers,
    onRevealSkill,
    onOpenSkillFile,
    isRevealing,
    isOpeningFile,
    editorApps,
    editorAppsLoading,
    onOpenInEditor,
  } = props

  const selectedSkillId = selectedSkill?.id ?? null
  const placeholder = renderCatalogPlaceholder({
    projectName,
    catalog,
    catalogError,
    isCatalogLoading,
    onRefresh,
  })

  const showToolbar = viewMode !== 'overview' && !placeholder

  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      <DialogTrigger render={trigger} />
      {/*
        A catalogue you look at and leave (R6): its view and Refresh in the
        header, no footer.
      */}
      <DialogContent size="full" height="tall">
        <DialogHeader
          actions={
            <>
              {renderViewSwitcher(viewMode, onViewModeChange)}
              <IconButton
                label="Refresh"
                size="sm"
                variant="ghost"
                onClick={onRefresh}
                pending={isCatalogLoading}
                disabledReason={
                  projectName ? undefined : 'Open a project first.'
                }
              >
                <RefreshCw />
              </IconButton>
            </>
          }
        >
          <DialogTitle className="flex items-center gap-2">
            <Library aria-hidden className="size-5 text-ink-muted" />
            Skills
          </DialogTitle>
          <DialogDescription>
            {projectName ? (
              <>
                <span className="tabular-nums">{filteredSkillCount}</span>/
                <span className="tabular-nums">{totalSkillCount}</span> skills
                in {projectName}.
              </>
            ) : (
              'Select a project to browse provider skills.'
            )}
          </DialogDescription>
          {loadingProviderNames.length > 0 ? (
            <p
              role="status"
              className="flex items-center gap-1.5 text-xs text-ink-muted"
            >
              <Spinner size="xs" />
              <span className="truncate">
                Loading {loadingProviderNames.join(', ')}…
              </span>
            </p>
          ) : null}
        </DialogHeader>

        {showToolbar ? renderFilterToolbar(props) : null}

        <div ref={detailArea} className="relative min-h-0 flex-1">
          {placeholder ? (
            <div className="p-6">{placeholder}</div>
          ) : viewMode === 'overview' ? (
            <div className={dialogPane}>
              <SkillsOverviewView
                overview={overview}
                onJumpToGrid={onJumpToGrid}
              />
            </div>
          ) : viewMode === 'grid' ? (
            <>
              <div className={dialogPane}>
                <SkillsGrid
                  groups={gridGroups}
                  selectedSkillId={selectedSkillId}
                  onSelectSkill={onSelectSkill}
                  showGroupHeaders={groupBy !== 'none'}
                />
              </div>
              {/*
                A skill's details slide in over the grid, inside the dialog:
                a Sheet held to the grid's area, over its lighter scrim. A
                press beside it, Escape or its own Close closes it.
              */}
              <Sheet
                open={isDetailOpen && selectedSkill !== null}
                onOpenChange={(open) => {
                  if (!open) onCloseDetail()
                }}
              >
                <SheetContent
                  aria-label={
                    selectedSkill
                      ? `${selectedSkill.name} details`
                      : 'Skill details'
                  }
                  container={detailArea}
                  showClose={false}
                  className="w-7/8 max-w-190 border-line-soft bg-canvas"
                >
                  {selectedSkill ? (
                    <SkillDetailPane
                      projectName={projectName}
                      catalog={catalog}
                      selectedSkill={selectedSkill}
                      selectedDetails={selectedDetails}
                      isDetailsLoading={isDetailsLoading}
                      detailsError={detailsError}
                      onOpenMcpServers={onOpenMcpServers}
                      onReveal={onRevealSkill}
                      onOpenFile={onOpenSkillFile}
                      isRevealing={isRevealing}
                      isOpeningFile={isOpeningFile}
                      editorApps={editorApps}
                      editorAppsLoading={editorAppsLoading}
                      onOpenInEditor={onOpenInEditor}
                      onClose={onCloseDetail}
                    />
                  ) : null}
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <div className="flex h-full min-h-0 flex-col lg:flex-row">
              <div className="app-scrollbar min-h-0 overflow-y-auto border-b border-line-soft p-4 lg:w-95 lg:shrink-0 lg:border-r lg:border-b-0">
                <SkillsListPane
                  groups={groups}
                  selectedSkillId={selectedSkillId}
                  onSelectSkill={onSelectSkill}
                />
              </div>
              <SkillDetailPane
                projectName={projectName}
                catalog={catalog}
                selectedSkill={selectedSkill}
                selectedDetails={selectedDetails}
                isDetailsLoading={isDetailsLoading}
                detailsError={detailsError}
                onOpenMcpServers={onOpenMcpServers}
                onReveal={onRevealSkill}
                onOpenFile={onOpenSkillFile}
                isRevealing={isRevealing}
                isOpeningFile={isOpeningFile}
                editorApps={editorApps}
                editorAppsLoading={editorAppsLoading}
                onOpenInEditor={onOpenInEditor}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
