import type { FC, ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BookOpen,
  LayoutDashboard,
  LayoutGrid,
  Library,
  List as ListIcon,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillDetails,
  SkillProviderId,
} from '@/entities/skill'
import type { ProjectOpenApp, ProjectOpenAppId } from '@/entities/project-open'
import { Button } from '@/shared/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { cn } from '@/shared/lib/cn.pure'
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

// Animated scrim that stays a real (accessible) Button rather than a bare div.
const MotionButton = motion.create(Button)

interface SkillsBrowserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
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
    <div className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/20 p-0.5">
      {VIEW_MODES.map((mode) => {
        const Icon = mode.icon
        const active = mode.id === value
        return (
          <Button
            key={mode.id}
            type="button"
            variant="ghost"
            onClick={() => onChange(mode.id)}
            aria-pressed={active}
            className={cn(
              'h-auto gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
              active
                ? 'bg-background text-foreground shadow-sm hover:bg-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {mode.label}
          </Button>
        )
      })}
    </div>
  )
}

function renderFilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn('w-[150px] normal-case tracking-normal', className)}
      >
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
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-6 py-3">
      <div className="relative min-w-[200px] flex-1">
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
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Group by
          </span>
          {renderFilterSelect({
            label: 'Group by',
            value: groupBy,
            onChange: (value) => onGroupByChange(value as SkillGroupBy),
            options: GROUP_BY_OPTIONS,
            className: 'w-[130px]',
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
}: Pick<
  SkillsBrowserDialogProps,
  'projectName' | 'catalog' | 'catalogError' | 'isCatalogLoading'
>): ReactNode | null {
  const hasCatalog = Boolean(catalog)
  if (!projectName) {
    return (
      <p className="text-sm text-muted-foreground">
        Open a project to browse skills.
      </p>
    )
  }
  if (catalogError && !hasCatalog) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {catalogError}
      </div>
    )
  }
  if (isCatalogLoading && !hasCatalog) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading skills...
      </div>
    )
  }
  if (hasCatalog && catalog?.providers.length === 0 && !isCatalogLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        No skill-capable providers are currently available.
      </p>
    )
  }
  return null
}

export const SkillsBrowserDialog: FC<SkillsBrowserDialogProps> = (props) => {
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
  })

  const showToolbar = viewMode !== 'overview' && !placeholder

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="h-[min(90vh,960px)] max-h-[min(90vh,960px)] w-[min(1400px,calc(100vw-3rem))] p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Library className="h-5 w-5 text-muted-foreground" />
                <DialogTitle>Skills</DialogTitle>
              </div>
              <DialogDescription className="mt-1">
                {projectName ? (
                  <>
                    <span className="tabular-nums">{filteredSkillCount}</span>/
                    <span className="tabular-nums">{totalSkillCount}</span>{' '}
                    skills in {projectName}.
                  </>
                ) : (
                  'Select a project to browse provider skills.'
                )}
              </DialogDescription>
              {loadingProviderNames.length > 0 ? (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="truncate">
                    Loading {loadingProviderNames.join(', ')}…
                  </span>
                </div>
              ) : null}
            </div>
            {renderViewSwitcher(viewMode, onViewModeChange)}
          </div>
        </DialogHeader>

        {showToolbar ? renderFilterToolbar(props) : null}

        <div className="relative min-h-0 flex-1">
          {placeholder ? (
            <div className="p-6">{placeholder}</div>
          ) : viewMode === 'overview' ? (
            <div className="app-scrollbar h-full min-h-0 overflow-y-auto px-6 py-5">
              <SkillsOverviewView
                overview={overview}
                onJumpToGrid={onJumpToGrid}
              />
            </div>
          ) : viewMode === 'grid' ? (
            <>
              <div className="app-scrollbar h-full min-h-0 overflow-y-auto px-6 py-5">
                <SkillsGrid
                  groups={gridGroups}
                  selectedSkillId={selectedSkillId}
                  onSelectSkill={onSelectSkill}
                  showGroupHeaders={groupBy !== 'none'}
                />
              </div>
              <AnimatePresence>
                {isDetailOpen && selectedSkill
                  ? [
                      <MotionButton
                        key="scrim"
                        type="button"
                        variant="ghost"
                        aria-label="Close details"
                        className="absolute inset-0 z-10 h-auto w-auto rounded-none bg-black/30 p-0 hover:bg-black/30"
                        onClick={onCloseDetail}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      />,
                      <motion.div
                        key="panel"
                        className="absolute inset-y-0 right-0 z-20 flex w-[min(620px,85%)] flex-col border-l border-border/70 bg-background shadow-2xl"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{
                          type: 'spring',
                          duration: 0.3,
                          bounce: 0,
                        }}
                      >
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
                      </motion.div>,
                    ]
                  : null}
              </AnimatePresence>
            </>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)]">
              <div className="app-scrollbar h-full min-h-0 overflow-y-auto border-b border-border/70 p-4 lg:border-r lg:border-b-0">
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

        <DialogFooter className="items-center border-t border-border/70 px-6 py-3">
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
