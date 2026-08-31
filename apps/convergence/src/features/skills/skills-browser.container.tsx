import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { Library } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import {
  skillApi,
  useSkillStore,
  type SkillCatalogEntry,
  type SkillProviderId,
} from '@/entities/skill'
import {
  projectOpenApi,
  type ProjectOpenApp,
  type ProjectOpenAppId,
} from '@/entities/project-open'
import { Button } from '@/shared/ui/button'
import {
  filterSkillCatalog,
  findSkillInGroups,
  firstSkillInGroups,
  groupSkillsForGrid,
  type SkillBrowserFilters,
  type SkillGroupBy,
} from './skills-browser.pure'
import { buildSkillsOverview } from './skills-overview.pure'
import {
  SkillsBrowserDialog,
  type SkillsViewMode,
} from './skills-browser.presentational'

const DEFAULT_FILTERS: SkillBrowserFilters = {
  query: '',
  providerId: 'all',
  origin: 'all',
  scope: 'all',
  enabled: 'all',
  warnings: 'all',
  dependencyState: 'all',
}

const DEFAULT_VIEW_MODE: SkillsViewMode = 'overview'
const DEFAULT_GROUP_BY: SkillGroupBy = 'provider'

interface SkillsBrowserDialogContainerProps {
  trigger?: ReactNode
}

export const SkillsBrowserDialogContainer: FC<
  SkillsBrowserDialogContainerProps
> = ({ trigger }) => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const projectId = activeProject?.id ?? null
  const projectName = activeProject?.name ?? null
  const open = useDialogStore((s) => s.openDialog === 'skills-browser')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const catalog = useSkillStore((s) => s.catalog)
  const isCatalogLoading = useSkillStore((s) => s.isCatalogLoading)
  const loadingProviders = useSkillStore((s) => s.loadingProviders)
  const catalogError = useSkillStore((s) => s.catalogError)
  const selectedSkillId = useSkillStore((s) => s.selectedSkillId)
  const detailsBySkillId = useSkillStore((s) => s.detailsBySkillId)
  const detailsErrorBySkillId = useSkillStore((s) => s.detailsErrorBySkillId)
  const loadingDetailsSkillId = useSkillStore((s) => s.loadingDetailsSkillId)
  const loadCatalog = useSkillStore((s) => s.loadCatalog)
  const selectSkill = useSkillStore((s) => s.selectSkill)
  const loadDetails = useSkillStore((s) => s.loadDetails)
  const resetSkills = useSkillStore((s) => s.reset)
  const [filters, setFilters] = useState<SkillBrowserFilters>(DEFAULT_FILTERS)
  const [viewMode, setViewMode] = useState<SkillsViewMode>(DEFAULT_VIEW_MODE)
  const [groupBy, setGroupBy] = useState<SkillGroupBy>(DEFAULT_GROUP_BY)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isRevealing, setIsRevealing] = useState(false)
  const [isOpeningFile, setIsOpeningFile] = useState(false)
  const [editorApps, setEditorApps] = useState<ProjectOpenApp[]>([])
  const [editorAppsLoading, setEditorAppsLoading] = useState(false)

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('skills-browser')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )

  const load = useCallback(
    async (forceReload = false) => {
      if (!projectId) {
        resetSkills()
        return
      }
      await loadCatalog(projectId, { forceReload })
    },
    [projectId, loadCatalog, resetSkills],
  )

  useEffect(() => {
    if (open) {
      void load()
    }
  }, [open, load])

  // Detect installed editors (Cursor / VS Code / Zed / WebStorm / Finder) once
  // the dialog opens, mirroring the session header's "Open" menu.
  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    setEditorAppsLoading(true)
    projectOpenApi
      .listApps()
      .then((apps) => {
        if (!cancelled) {
          setEditorApps(apps)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEditorApps([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEditorAppsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    resetSkills()
    setFilters(DEFAULT_FILTERS)
    setViewMode(DEFAULT_VIEW_MODE)
    setGroupBy(DEFAULT_GROUP_BY)
    setIsDetailOpen(false)
    if (useDialogStore.getState().openDialog === 'skills-browser') {
      closeDialog()
    }
  }, [projectId, resetSkills, closeDialog])

  const groups = useMemo(
    () => filterSkillCatalog(catalog, filters),
    [catalog, filters],
  )
  const gridGroups = useMemo(
    () => groupSkillsForGrid(groups, groupBy),
    [groups, groupBy],
  )
  const overview = useMemo(() => buildSkillsOverview(catalog), [catalog])
  const activeSkill = findSkillInGroups(groups, selectedSkillId)
  // List always shows a detail pane, so fall back to the first skill there.
  // Grid and overview reflect only an explicit selection (no auto-pick), so the
  // footer path and grid highlight stay empty until the user actually picks one.
  const selectedSkill =
    viewMode === 'list'
      ? (activeSkill ?? firstSkillInGroups(groups))
      : activeSkill

  useEffect(() => {
    if (!open || !projectId || !selectedSkill || !selectedSkill.path) {
      return
    }
    if (detailsBySkillId[selectedSkill.id]) {
      return
    }
    if (detailsErrorBySkillId[selectedSkill.id]) {
      return
    }
    if (loadingDetailsSkillId === selectedSkill.id) {
      return
    }

    void loadDetails(projectId, selectedSkill)
  }, [
    open,
    projectId,
    selectedSkill,
    detailsBySkillId,
    detailsErrorBySkillId,
    loadingDetailsSkillId,
    loadDetails,
  ])

  const providerOptions = useMemo(() => {
    const providers = new Map<SkillProviderId, string>()
    for (const provider of catalog?.providers ?? []) {
      providers.set(provider.providerId, provider.providerName)
    }
    return Array.from(providers, ([id, label]) => ({ id, label }))
  }, [catalog])

  const totalSkillCount = useMemo(
    () =>
      catalog?.providers.reduce(
        (count, provider) => count + provider.skills.length,
        0,
      ) ?? 0,
    [catalog],
  )
  const filteredSkillCount = useMemo(
    () => groups.reduce((count, provider) => count + provider.skills.length, 0),
    [groups],
  )

  const handleFiltersChange = useCallback(
    (patch: Partial<SkillBrowserFilters>) => {
      setFilters((current) => ({ ...current, ...patch }))
    },
    [],
  )

  const handleViewModeChange = useCallback(
    (mode: SkillsViewMode) => {
      if (mode === 'overview') {
        // Overview is the clean landscape: drop the drill-in filter, the current
        // selection, and any open detail panel (so the footer path clears too).
        setFilters(DEFAULT_FILTERS)
        selectSkill(null)
        setIsDetailOpen(false)
        setViewMode('overview')
        return
      }
      setViewMode(mode)
      // Returning to grid with a skill still selected re-opens its slide-over;
      // list always shows the detail in its right pane regardless.
      setIsDetailOpen(mode === 'grid' && selectedSkillId !== null)
    },
    [selectSkill, selectedSkillId],
  )

  const handleJumpToGrid = useCallback(
    (patch: Partial<SkillBrowserFilters>) => {
      // Each dashboard drill-in is a single fresh filter, not an accumulation on
      // top of whatever the previous card selected.
      setFilters({ ...DEFAULT_FILTERS, ...patch })
      setViewMode('grid')
      setIsDetailOpen(false)
    },
    [],
  )

  const handleSelectSkill = useCallback(
    (skillId: string) => {
      selectSkill(skillId)
      if (viewMode !== 'list') {
        setIsDetailOpen(true)
      }
    },
    [selectSkill, viewMode],
  )

  const handleCloseDetail = useCallback(() => {
    setIsDetailOpen(false)
  }, [])

  const buildSkillRequest = useCallback(
    (skill: SkillCatalogEntry) =>
      projectId && skill.path
        ? {
            projectId,
            providerId: skill.providerId,
            skillId: skill.id,
            path: skill.path,
          }
        : null,
    [projectId],
  )

  const handleRevealSkill = useCallback(async () => {
    if (!selectedSkill) {
      return
    }
    const request = buildSkillRequest(selectedSkill)
    if (!request) {
      return
    }
    setIsRevealing(true)
    try {
      await skillApi.reveal(request)
    } catch {
      // Surfacing a failure here is best-effort; the spinner just resets.
    } finally {
      setIsRevealing(false)
    }
  }, [selectedSkill, buildSkillRequest])

  const handleOpenSkillFile = useCallback(async () => {
    if (!selectedSkill) {
      return
    }
    const request = buildSkillRequest(selectedSkill)
    if (!request) {
      return
    }
    setIsOpeningFile(true)
    try {
      await skillApi.openPath(request)
    } catch {
      // Best-effort; reset the spinner regardless of outcome.
    } finally {
      setIsOpeningFile(false)
    }
  }, [selectedSkill, buildSkillRequest])

  const handleOpenInEditor = useCallback(
    (appId: ProjectOpenAppId) => {
      if (!selectedSkill?.path) {
        return
      }
      // Open the skill's folder (SKILL.md + resources), not just the file.
      const folder = selectedSkill.path.replace(/[/\\][^/\\]*$/, '')
      void projectOpenApi.open({ appId, path: folder || selectedSkill.path })
    },
    [selectedSkill],
  )

  const handleOpenMcpServers = useCallback(() => {
    openDialog('mcp-servers')
  }, [openDialog])

  return (
    <SkillsBrowserDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={projectName}
      catalog={catalog}
      viewMode={viewMode}
      groupBy={groupBy}
      groups={groups}
      gridGroups={gridGroups}
      overview={overview}
      selectedSkill={selectedSkill}
      selectedDetails={
        selectedSkill ? (detailsBySkillId[selectedSkill.id] ?? null) : null
      }
      isCatalogLoading={isCatalogLoading}
      loadingProviderNames={loadingProviders.map(
        (provider) => provider.providerName,
      )}
      catalogError={catalogError}
      isDetailsLoading={
        selectedSkill ? loadingDetailsSkillId === selectedSkill.id : false
      }
      detailsError={
        selectedSkill ? detailsErrorBySkillId[selectedSkill.id] || null : null
      }
      isDetailOpen={isDetailOpen}
      filters={filters}
      providerOptions={providerOptions}
      totalSkillCount={totalSkillCount}
      filteredSkillCount={filteredSkillCount}
      onViewModeChange={handleViewModeChange}
      onGroupByChange={setGroupBy}
      onFiltersChange={handleFiltersChange}
      onJumpToGrid={handleJumpToGrid}
      onSelectSkill={handleSelectSkill}
      onCloseDetail={handleCloseDetail}
      onRefresh={() => void load(true)}
      onOpenMcpServers={handleOpenMcpServers}
      onRevealSkill={handleRevealSkill}
      onOpenSkillFile={handleOpenSkillFile}
      isRevealing={isRevealing}
      isOpeningFile={isOpeningFile}
      editorApps={editorApps}
      editorAppsLoading={editorAppsLoading}
      onOpenInEditor={handleOpenInEditor}
      trigger={
        trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={!projectId}
          >
            <span className="flex items-center gap-2">
              <Library className="h-3.5 w-3.5" />
              Skills
            </span>
            <span className="text-[11px] text-muted-foreground/80">
              {catalog ? totalSkillCount : 'View'}
            </span>
          </Button>
        )
      }
    />
  )
}
