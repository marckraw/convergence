import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { Library } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import {
  useSkillStore,
  type SkillProviderId,
  type SkillScope,
} from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import {
  filterSkillCatalog,
  findSkillInGroups,
  firstSkillInGroups,
  type SkillBrowserFilters,
} from './skills-browser.pure'
import { SkillsBrowserDialog } from './skills-browser.presentational'

const DEFAULT_FILTERS: SkillBrowserFilters = {
  query: '',
  providerId: 'all',
  scope: 'all',
  enabled: 'all',
  warnings: 'all',
  dependencyState: 'all',
}

export const SkillsBrowserDialogContainer: FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const projectId = activeProject?.id ?? null
  const projectName = activeProject?.name ?? null
  const open = useDialogStore((s) => s.openDialog === 'skills-browser')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const catalog = useSkillStore((s) => s.catalog)
  const isCatalogLoading = useSkillStore((s) => s.isCatalogLoading)
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

  useEffect(() => {
    resetSkills()
    setFilters(DEFAULT_FILTERS)
    if (useDialogStore.getState().openDialog === 'skills-browser') {
      closeDialog()
    }
  }, [projectId, resetSkills, closeDialog])

  const groups = useMemo(
    () => filterSkillCatalog(catalog, filters),
    [catalog, filters],
  )
  const selectedSkill =
    findSkillInGroups(groups, selectedSkillId) ?? firstSkillInGroups(groups)

  useEffect(() => {
    if (!open) {
      return
    }

    if (selectedSkill?.id !== selectedSkillId) {
      selectSkill(selectedSkill?.id ?? null)
    }
  }, [open, selectedSkill, selectedSkillId, selectSkill])

  useEffect(() => {
    if (!open || !projectId || !selectedSkill) {
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

  const scopeOptions = useMemo(() => {
    const scopes = new Set<SkillScope>()
    for (const provider of catalog?.providers ?? []) {
      for (const skill of provider.skills) {
        scopes.add(skill.scope)
      }
    }
    return Array.from(scopes).sort()
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

  const handleOpenMcpServers = useCallback(() => {
    openDialog('mcp-servers')
  }, [openDialog])

  return (
    <SkillsBrowserDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={projectName}
      catalog={catalog}
      groups={groups}
      selectedSkill={selectedSkill}
      selectedDetails={
        selectedSkill ? (detailsBySkillId[selectedSkill.id] ?? null) : null
      }
      isCatalogLoading={isCatalogLoading}
      catalogError={catalogError}
      isDetailsLoading={
        selectedSkill ? loadingDetailsSkillId === selectedSkill.id : false
      }
      detailsError={
        selectedSkill ? detailsErrorBySkillId[selectedSkill.id] || null : null
      }
      filters={filters}
      providerOptions={providerOptions}
      scopeOptions={scopeOptions}
      totalSkillCount={totalSkillCount}
      filteredSkillCount={filteredSkillCount}
      onFiltersChange={handleFiltersChange}
      onSelectSkill={selectSkill}
      onRefresh={() => void load(true)}
      onOpenMcpServers={handleOpenMcpServers}
      trigger={
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
      }
    />
  )
}
