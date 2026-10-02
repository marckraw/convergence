import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import type { FC } from 'react'
import { BookOpenText } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import { usePromptLibraryStore } from '@/entities/prompt-library'
import { Button, useConfirm } from '@convergence/ui'
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
  trigger?: ReactElement
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
  // Deleting a prompt asks first, in the app's dialog (R5).
  const confirm = useConfirm()
  const isMutating = usePromptLibraryStore((s) => s.isMutating)
  const mutationError = usePromptLibraryStore((s) => s.mutationError)
  const resetPrompts = usePromptLibraryStore((s) => s.reset)
  const [filters, setFilters] =
    useState<PromptLibraryBrowserFilters>(DEFAULT_FILTERS)
  const [formDraft, setFormDraft] = useState<PromptLibraryFormDraft | null>(
    null,
  )
  const [formError, setFormError] = useState<string | null>(null)
  // The editor's draft as it opened: Done asks before dropping changes to it.
  const formOrigin = useRef<PromptLibraryFormDraft | null>(null)

  const handleOpenChange = useCallback(
    async (next: boolean) => {
      if (next) {
        openDialog('prompt-library')
        return
      }
      const editing =
        formDraft !== null &&
        JSON.stringify(formDraft) !== JSON.stringify(formOrigin.current)
      if (editing) {
        // The library saves as you go, but the editor keeps its draft until
        // Save: closing would drop it, so it asks first (R5, DLG-10).
        const discard = await confirm({
          title: 'Discard the prompt you’re editing?',
          description: 'Your changes to it haven’t been saved.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
          variant: 'danger',
        })
        if (!discard) return
      }
      closeDialog()
    },
    [openDialog, closeDialog, confirm, formDraft],
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
    const draft: PromptLibraryFormDraft = {
      mode: 'create',
      scope: 'project',
      kind: 'markdown',
      title: '',
      description: '',
      tagsText: '',
      filename: '',
      promptText: '',
    }
    formOrigin.current = draft
    setFormDraft(draft)
  }, [])

  const handleStartEdit = useCallback(
    (prompt: typeof selectedPrompt) => {
      if (!prompt || !selectedDetails) {
        return
      }

      setFormError(null)
      const draft: PromptLibraryFormDraft = {
        mode: 'edit',
        scope: prompt.scope,
        kind: prompt.kind,
        title: prompt.title,
        description: prompt.description,
        tagsText: prompt.tags.join(', '),
        filename: prompt.relativePath,
        promptText: selectedDetails.promptText,
      }
      formOrigin.current = draft
      setFormDraft(draft)
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

  // Enable cmd+Enter to submit the form; Save says so in its tooltip (DS-34)
  const submitShortcut = useFormSubmitShortcut(
    formDraft !== null,
    handleSubmitForm,
  )

  const handleDeletePrompt = useCallback(
    async (prompt: typeof selectedPrompt) => {
      if (!projectId || !prompt) {
        return
      }

      const confirmed = await confirm({
        title: `Delete prompt “${prompt.title}”?`,
        description:
          'Its file is removed from disk and its Convergence details are deleted, for good.',
        confirmLabel: 'Delete prompt',
        variant: 'danger',
      })
      if (!confirmed) {
        return
      }

      await deletePrompt({
        projectId,
        promptId: prompt.id,
        path: prompt.path,
      })
    },
    [confirm, deletePrompt, projectId],
  )

  return (
    <PromptLibraryBrowserDialog
      open={open}
      onOpenChange={(next) => void handleOpenChange(next)}
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
      submitShortcut={submitShortcut}
      onDeletePrompt={handleDeletePrompt}
      trigger={
        trigger ?? (
          <Button
            type="button"
            variant="quiet"
            disabled={!projectId}
            className="w-full justify-between px-2"
          >
            <span className="flex items-center gap-2">
              <BookOpenText className="h-3.5 w-3.5" />
              Prompts
            </span>
            <span className="text-2xs text-ink-muted/80">
              {catalog ? totalPromptCount : 'View'}
            </span>
          </Button>
        )
      }
    />
  )
}
