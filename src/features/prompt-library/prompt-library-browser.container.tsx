import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { BookOpenText } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import { usePromptLibraryStore } from '@/entities/prompt-library'
import { Button } from '@/shared/ui/button'
import {
  collectPromptTags,
  filterPromptLibraryCatalog,
  findPrompt,
  firstPrompt,
  type PromptLibraryBrowserFilters,
} from './prompt-library-browser.pure'
import { PromptLibraryBrowserDialog } from './prompt-library-browser.presentational'

const DEFAULT_FILTERS: PromptLibraryBrowserFilters = {
  query: '',
  scope: 'all',
  kind: 'all',
  tag: 'all',
}

export const PromptLibraryBrowserDialogContainer: FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const projectId = activeProject?.id ?? null
  const projectName = activeProject?.name ?? null
  const open = useDialogStore((s) => s.openDialog === 'prompt-library')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const catalog = usePromptLibraryStore((s) => s.catalog)
  const isCatalogLoading = usePromptLibraryStore((s) => s.isCatalogLoading)
  const catalogError = usePromptLibraryStore((s) => s.catalogError)
  const selectedPromptId = usePromptLibraryStore((s) => s.selectedPromptId)
  const detailsByPromptId = usePromptLibraryStore((s) => s.detailsByPromptId)
  const detailsErrorByPromptId = usePromptLibraryStore(
    (s) => s.detailsErrorByPromptId,
  )
  const loadingDetailsPromptId = usePromptLibraryStore(
    (s) => s.loadingDetailsPromptId,
  )
  const loadCatalog = usePromptLibraryStore((s) => s.loadCatalog)
  const selectPrompt = usePromptLibraryStore((s) => s.selectPrompt)
  const loadDetails = usePromptLibraryStore((s) => s.loadDetails)
  const resetPrompts = usePromptLibraryStore((s) => s.reset)
  const [filters, setFilters] =
    useState<PromptLibraryBrowserFilters>(DEFAULT_FILTERS)

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('prompt-library')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )

  const load = useCallback(
    async (forceReload = false) => {
      if (!projectId) {
        resetPrompts()
        return
      }
      await loadCatalog(projectId, { forceReload })
    },
    [projectId, loadCatalog, resetPrompts],
  )

  useEffect(() => {
    if (open) {
      void load()
    }
  }, [open, load])

  useEffect(() => {
    resetPrompts()
    setFilters(DEFAULT_FILTERS)
    if (useDialogStore.getState().openDialog === 'prompt-library') {
      closeDialog()
    }
  }, [projectId, resetPrompts, closeDialog])

  const prompts = useMemo(
    () => filterPromptLibraryCatalog(catalog, filters),
    [catalog, filters],
  )
  const selectedPrompt =
    findPrompt(prompts, selectedPromptId) ?? firstPrompt(prompts)

  useEffect(() => {
    if (!open) {
      return
    }

    if (selectedPrompt?.id !== selectedPromptId) {
      selectPrompt(selectedPrompt?.id ?? null)
    }
  }, [open, selectedPrompt, selectedPromptId, selectPrompt])

  useEffect(() => {
    if (!open || !projectId || !selectedPrompt) {
      return
    }
    if (detailsByPromptId[selectedPrompt.id]) {
      return
    }
    if (detailsErrorByPromptId[selectedPrompt.id]) {
      return
    }
    if (loadingDetailsPromptId === selectedPrompt.id) {
      return
    }

    void loadDetails(projectId, selectedPrompt)
  }, [
    open,
    projectId,
    selectedPrompt,
    detailsByPromptId,
    detailsErrorByPromptId,
    loadingDetailsPromptId,
    loadDetails,
  ])

  const totalPromptCount = catalog?.prompts.length ?? 0
  const filteredPromptCount = prompts.length
  const tagOptions = useMemo(() => collectPromptTags(catalog), [catalog])

  const handleFiltersChange = useCallback(
    (patch: Partial<PromptLibraryBrowserFilters>) => {
      setFilters((current) => ({ ...current, ...patch }))
    },
    [],
  )

  return (
    <PromptLibraryBrowserDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={projectName}
      catalog={catalog}
      prompts={prompts}
      selectedPrompt={selectedPrompt}
      selectedDetails={
        selectedPrompt ? (detailsByPromptId[selectedPrompt.id] ?? null) : null
      }
      isCatalogLoading={isCatalogLoading}
      catalogError={catalogError}
      isDetailsLoading={
        selectedPrompt ? loadingDetailsPromptId === selectedPrompt.id : false
      }
      detailsError={
        selectedPrompt
          ? detailsErrorByPromptId[selectedPrompt.id] || null
          : null
      }
      filters={filters}
      tagOptions={tagOptions}
      totalPromptCount={totalPromptCount}
      filteredPromptCount={filteredPromptCount}
      onFiltersChange={handleFiltersChange}
      onSelectPrompt={selectPrompt}
      onRefresh={() => void load(true)}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
          disabled={!projectId}
        >
          <span className="flex items-center gap-2">
            <BookOpenText className="h-3.5 w-3.5" />
            Prompts
          </span>
          <span className="text-[11px] text-muted-foreground/80">
            {catalog ? totalPromptCount : 'View'}
          </span>
        </Button>
      }
    />
  )
}
