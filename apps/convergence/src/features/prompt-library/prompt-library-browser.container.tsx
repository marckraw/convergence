import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
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
import {
  PromptLibraryBrowserDialog,
  type PromptLibraryFormDraft,
} from './prompt-library-browser.presentational'
import { useFormSubmitShortcut } from '@/shared/lib/use-form-submit-shortcut.pure'

const DEFAULT_FILTERS: PromptLibraryBrowserFilters = {
  query: '',
  scope: 'all',
  kind: 'all',
  tag: 'all',
}

interface PromptLibraryBrowserDialogContainerProps {
  trigger?: ReactNode
}

export const PromptLibraryBrowserDialogContainer: FC<
  PromptLibraryBrowserDialogContainerProps
> = ({ trigger }) => {
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
  const createPrompt = usePromptLibraryStore((s) => s.createPrompt)
  const updatePrompt = usePromptLibraryStore((s) => s.updatePrompt)
  const deletePrompt = usePromptLibraryStore((s) => s.deletePrompt)
  const isMutating = usePromptLibraryStore((s) => s.isMutating)
  const mutationError = usePromptLibraryStore((s) => s.mutationError)
  const resetPrompts = usePromptLibraryStore((s) => s.reset)
  const [filters, setFilters] =
    useState<PromptLibraryBrowserFilters>(DEFAULT_FILTERS)
  const [formDraft, setFormDraft] = useState<PromptLibraryFormDraft | null>(
    null,
  )
  const [formError, setFormError] = useState<string | null>(null)

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
    setFormDraft(null)
    setFormError(null)
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
  const selectedDetails = selectedPrompt
    ? (detailsByPromptId[selectedPrompt.id] ?? null)
    : null

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

  const handleStartCreate = useCallback(() => {
    setFormError(null)
    setFormDraft({
      mode: 'create',
      scope: 'project',
      kind: 'markdown',
      title: '',
      description: '',
      tagsText: '',
      filename: '',
      promptText: '',
    })
  }, [])

  const handleStartEdit = useCallback(
    (prompt: typeof selectedPrompt) => {
      if (!prompt || !selectedDetails) {
        return
      }

      setFormError(null)
      setFormDraft({
        mode: 'edit',
        scope: prompt.scope,
        kind: prompt.kind,
        title: prompt.title,
        description: prompt.description,
        tagsText: prompt.tags.join(', '),
        filename: prompt.relativePath,
        promptText: selectedDetails.promptText,
      })
    },
    [selectedDetails],
  )

  const handleCancelForm = useCallback(() => {
    setFormDraft(null)
    setFormError(null)
  }, [])

  const handleFormChange = useCallback(
    (patch: Partial<PromptLibraryFormDraft>) => {
      setFormDraft((current) => (current ? { ...current, ...patch } : current))
      setFormError(null)
    },
    [],
  )

  const parseTags = useCallback((value: string) => {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }, [])

  const handleSubmitForm = useCallback(async () => {
    if (!projectId || !formDraft) {
      return
    }

    if (!formDraft.title.trim()) {
      setFormError('Prompt title cannot be empty.')
      return
    }
    if (!formDraft.promptText.trim()) {
      setFormError('Prompt text cannot be empty.')
      return
    }

    const tags = parseTags(formDraft.tagsText)
    const saved =
      formDraft.mode === 'create'
        ? await createPrompt({
            projectId,
            scope: formDraft.scope,
            title: formDraft.title,
            description: formDraft.description,
            tags,
            promptText: formDraft.promptText,
            filename: formDraft.filename,
            kind: formDraft.kind,
          })
        : selectedPrompt
          ? await updatePrompt({
              projectId,
              promptId: selectedPrompt.id,
              path: selectedPrompt.path,
              title: formDraft.title,
              description: formDraft.description,
              tags,
              promptText: formDraft.promptText,
            })
          : null

    if (saved) {
      setFormDraft(null)
      setFormError(null)
    }
  }, [
    createPrompt,
    formDraft,
    parseTags,
    projectId,
    selectedPrompt,
    updatePrompt,
  ])

  // Enable cmd+Enter to submit the form
  useFormSubmitShortcut(formDraft !== null, handleSubmitForm)

  const handleDeletePrompt = useCallback(
    async (prompt: typeof selectedPrompt) => {
      if (!projectId || !prompt) {
        return
      }

      const confirmed = window.confirm(
        `Delete prompt "${prompt.title}"?\n\nThis removes the prompt file from disk and deletes its Convergence metadata.`,
      )
      if (!confirmed) {
        return
      }

      await deletePrompt({
        projectId,
        promptId: prompt.id,
        path: prompt.path,
      })
    },
    [deletePrompt, projectId],
  )

  return (
    <PromptLibraryBrowserDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={projectName}
      catalog={catalog}
      prompts={prompts}
      selectedPrompt={selectedPrompt}
      selectedDetails={selectedDetails}
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
      formDraft={formDraft}
      formError={formError ?? mutationError}
      isMutating={isMutating}
      onFiltersChange={handleFiltersChange}
      onSelectPrompt={selectPrompt}
      onRefresh={() => void load(true)}
      onStartCreate={handleStartCreate}
      onStartEdit={handleStartEdit}
      onCancelForm={handleCancelForm}
      onFormChange={handleFormChange}
      onSubmitForm={() => void handleSubmitForm()}
      onDeletePrompt={handleDeletePrompt}
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
              <BookOpenText className="h-3.5 w-3.5" />
              Prompts
            </span>
            <span className="text-[11px] text-muted-foreground/80">
              {catalog ? totalPromptCount : 'View'}
            </span>
          </Button>
        )
      }
    />
  )
}
