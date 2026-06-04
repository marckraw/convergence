import type { FC, ReactNode } from 'react'
import {
  BookOpenText,
  FileText,
  Library,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import type {
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryEntry,
  PromptLibraryScope,
} from '@/entities/prompt-library'
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
import { NativeSelect } from '@/shared/ui/native-select'
import { Markdown } from '@/shared/ui/markdown.container'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import type { PromptLibraryBrowserFilters } from './prompt-library-browser.pure'

export interface PromptLibraryFormDraft {
  mode: 'create' | 'edit'
  scope: PromptLibraryScope
  kind: PromptLibraryEntry['kind']
  title: string
  description: string
  tagsText: string
  filename: string
  promptText: string
}

interface PromptLibraryBrowserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  projectName: string | null
  catalog: PromptLibraryCatalog | null
  prompts: PromptLibraryEntry[]
  selectedPrompt: PromptLibraryEntry | null
  selectedDetails: PromptLibraryDetails | null
  isCatalogLoading: boolean
  catalogError: string | null
  isDetailsLoading: boolean
  detailsError: string | null
  filters: PromptLibraryBrowserFilters
  tagOptions: string[]
  totalPromptCount: number
  filteredPromptCount: number
  formDraft: PromptLibraryFormDraft | null
  formError: string | null
  isMutating: boolean
  onFiltersChange: (patch: Partial<PromptLibraryBrowserFilters>) => void
  onSelectPrompt: (promptId: string) => void
  onRefresh: () => void
  onStartCreate: () => void
  onStartEdit: (prompt: PromptLibraryEntry) => void
  onCancelForm: () => void
  onFormChange: (patch: Partial<PromptLibraryFormDraft>) => void
  onSubmitForm: () => void
  onDeletePrompt: (prompt: PromptLibraryEntry) => void
}

const SCOPE_LABELS: Record<PromptLibraryScope, string> = {
  project: 'Project',
  global: 'Global',
}

const KIND_LABELS: Record<PromptLibraryEntry['kind'], string> = {
  markdown: 'Markdown',
  text: 'Text',
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
      <NativeSelect
        selectSize="sm"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="mt-1 normal-case tracking-normal"
      >
        {children}
      </NativeSelect>
    </label>
  )
}

function renderPromptRow(
  prompt: PromptLibraryEntry,
  selectedPromptId: string | null,
  onSelectPrompt: (promptId: string) => void,
) {
  const selected = prompt.id === selectedPromptId

  return (
    <Button
      key={prompt.id}
      type="button"
      variant="ghost"
      onClick={() => onSelectPrompt(prompt.id)}
      className={cn(
        'h-auto w-full justify-start rounded-lg border border-transparent px-3 py-2 text-left',
        selected
          ? 'border-primary/30 bg-primary/10 text-foreground'
          : 'hover:border-border/70 hover:bg-muted/40',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{prompt.title}</span>
          <span className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {prompt.sourceLabel}
          </span>
        </span>
        <span className="mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
          {prompt.shortDescription || prompt.description || prompt.relativePath}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {KIND_LABELS[prompt.kind]}
          </span>
          {prompt.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
      </span>
    </Button>
  )
}

function renderDetailsPane({
  projectName,
  selectedPrompt,
  selectedDetails,
  isDetailsLoading,
  detailsError,
  formDraft,
  formError,
  isMutating,
  onStartEdit,
  onCancelForm,
  onFormChange,
  onSubmitForm,
  onDeletePrompt,
}: Pick<
  PromptLibraryBrowserDialogProps,
  | 'projectName'
  | 'selectedPrompt'
  | 'selectedDetails'
  | 'isDetailsLoading'
  | 'detailsError'
  | 'formDraft'
  | 'formError'
  | 'isMutating'
  | 'onStartEdit'
  | 'onCancelForm'
  | 'onFormChange'
  | 'onSubmitForm'
  | 'onDeletePrompt'
>) {
  if (!projectName) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Open a project to inspect prompts.
      </div>
    )
  }

  if (formDraft) {
    return renderPromptForm({
      draft: formDraft,
      error: formError,
      isMutating,
      onCancel: onCancelForm,
      onChange: onFormChange,
      onSubmit: onSubmitForm,
    })
  }

  if (!selectedPrompt) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No prompt selected.
      </div>
    )
  }

  return (
    <div className="app-scrollbar h-full min-h-0 overflow-y-auto px-6 py-5">
      <div className="mb-4 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {SCOPE_LABELS[selectedPrompt.scope]}
            </span>
            <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {KIND_LABELS[selectedPrompt.kind]}
            </span>
          </div>
          <h3 className="truncate text-lg font-semibold">
            {selectedPrompt.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedPrompt.description || selectedPrompt.relativePath}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {selectedDetails ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStartEdit(selectedPrompt)}
              disabled={isMutating}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDeletePrompt(selectedPrompt)}
            disabled={isMutating}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Path
            </p>
            <CopyButton text={selectedPrompt.path} label="Copy prompt path" />
          </div>
          <p
            className="break-all font-mono text-xs text-muted-foreground"
            title={selectedPrompt.path}
          >
            {selectedPrompt.path}
          </p>
        </section>

        {selectedPrompt.tags.length > 0 ? (
          <section className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedPrompt.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {isDetailsLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prompt...
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Prompt Text
                </p>
                <CopyButton
                  text={selectedDetails.promptText}
                  label="Copy prompt text"
                />
              </div>
              <pre className="app-scrollbar max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-border/70 bg-background/60 p-3 text-xs leading-5 text-foreground">
                {selectedDetails.promptText}
              </pre>
            </section>

            <section className="rounded-lg border border-border/70 bg-background/60 p-4">
              <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Preview</p>
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

function renderPromptForm({
  draft,
  error,
  isMutating,
  onCancel,
  onChange,
  onSubmit,
}: {
  draft: PromptLibraryFormDraft
  error: string | null
  isMutating: boolean
  onCancel: () => void
  onChange: (patch: Partial<PromptLibraryFormDraft>) => void
  onSubmit: () => void
}) {
  return (
    <div className="app-scrollbar h-full min-h-0 overflow-y-auto px-6 py-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            {draft.mode === 'create' ? 'Create Prompt' : 'Edit Prompt'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Prompt text is stored as a file; metadata is tracked by Convergence.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isMutating}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isMutating}
          >
            {isMutating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            Title
            <Input
              value={draft.title}
              onChange={(event) =>
                onChange({ title: event.currentTarget.value })
              }
              className="mt-1"
              placeholder="PR Review"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Tags
            <Input
              value={draft.tagsText}
              onChange={(event) =>
                onChange({ tagsText: event.currentTarget.value })
              }
              className="mt-1"
              placeholder="review, github"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            Scope
            <NativeSelect
              value={draft.scope}
              onChange={(event) =>
                onChange({
                  scope: event.currentTarget.value as PromptLibraryScope,
                })
              }
              disabled={draft.mode === 'edit'}
              className="mt-1"
            >
              <option value="project">Project</option>
              <option value="global">Global</option>
            </NativeSelect>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            File Kind
            <NativeSelect
              value={draft.kind}
              onChange={(event) =>
                onChange({
                  kind: event.currentTarget.value as PromptLibraryEntry['kind'],
                })
              }
              disabled={draft.mode === 'edit'}
              className="mt-1"
            >
              <option value="markdown">Markdown</option>
              <option value="text">Text</option>
            </NativeSelect>
          </label>
        </div>

        {draft.mode === 'create' ? (
          <label className="text-xs font-medium text-muted-foreground">
            Filename
            <Input
              value={draft.filename}
              onChange={(event) =>
                onChange({ filename: event.currentTarget.value })
              }
              className="mt-1"
              placeholder="Optional; generated from title"
            />
          </label>
        ) : null}

        <label className="text-xs font-medium text-muted-foreground">
          Description
          <Textarea
            value={draft.description}
            onChange={(event) =>
              onChange({ description: event.currentTarget.value })
            }
            className="mt-1 min-h-20"
            placeholder="What this prompt is for"
          />
        </label>

        <label className="text-xs font-medium text-muted-foreground">
          Prompt Text
          <Textarea
            value={draft.promptText}
            onChange={(event) =>
              onChange({ promptText: event.currentTarget.value })
            }
            className="mt-1 min-h-72 font-mono text-xs leading-5"
            placeholder="Write the prompt text to copy into the composer"
          />
        </label>

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const PromptLibraryBrowserDialog: FC<
  PromptLibraryBrowserDialogProps
> = ({
  open,
  onOpenChange,
  trigger,
  projectName,
  catalog,
  prompts,
  selectedPrompt,
  selectedDetails,
  isCatalogLoading,
  catalogError,
  isDetailsLoading,
  detailsError,
  filters,
  tagOptions,
  totalPromptCount,
  filteredPromptCount,
  formDraft,
  formError,
  isMutating,
  onFiltersChange,
  onSelectPrompt,
  onRefresh,
  onStartCreate,
  onStartEdit,
  onCancelForm,
  onFormChange,
  onSubmitForm,
  onDeletePrompt,
}) => {
  const selectedPromptId = selectedPrompt?.id ?? null
  const hasCatalog = Boolean(catalog)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[min(1180px,calc(100vw-2rem))] max-h-[min(86vh,820px)] p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <div className="flex items-center gap-2">
            <BookOpenText className="h-5 w-5 text-muted-foreground" />
            <DialogTitle>Prompt Library</DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={onStartCreate}
              disabled={!projectName || isMutating}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
          <DialogDescription>
            {projectName
              ? `${filteredPromptCount}/${totalPromptCount} prompts in ${projectName}.`
              : 'Select a project to browse saved prompts.'}
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
                  placeholder="Search prompts"
                  className="pl-8"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {renderSelectControl({
                  label: 'Scope',
                  value: filters.scope,
                  onChange: (value) =>
                    onFiltersChange({
                      scope: value as PromptLibraryBrowserFilters['scope'],
                    }),
                  children: (
                    <>
                      <option value="all">All scopes</option>
                      <option value="project">Project</option>
                      <option value="global">Global</option>
                    </>
                  ),
                })}
                {renderSelectControl({
                  label: 'Kind',
                  value: filters.kind,
                  onChange: (value) =>
                    onFiltersChange({
                      kind: value as PromptLibraryBrowserFilters['kind'],
                    }),
                  children: (
                    <>
                      <option value="all">All files</option>
                      <option value="markdown">Markdown</option>
                      <option value="text">Text</option>
                    </>
                  ),
                })}
                {renderSelectControl({
                  label: 'Tag',
                  value: filters.tag,
                  onChange: (value) => onFiltersChange({ tag: value }),
                  children: (
                    <>
                      <option value="all">All tags</option>
                      {tagOptions.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </>
                  ),
                })}
              </div>
            </div>

            <div className="app-scrollbar h-[min(52vh,520px)] overflow-y-auto p-4 lg:h-auto lg:min-h-0 lg:flex-1">
              {!projectName ? (
                <p className="text-sm text-muted-foreground">
                  Open a project to browse prompts.
                </p>
              ) : catalogError && !hasCatalog ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {catalogError}
                </div>
              ) : isCatalogLoading && !hasCatalog ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading prompts...
                </div>
              ) : hasCatalog && catalog?.prompts.length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>No prompts found.</p>
                  <p className="text-xs">
                    Add Markdown or text files under `.convergence/prompts`.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onStartCreate}
                    disabled={isMutating}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create prompt
                  </Button>
                </div>
              ) : prompts.length > 0 ? (
                <div className="space-y-2">
                  {prompts.map((prompt) =>
                    renderPromptRow(prompt, selectedPromptId, onSelectPrompt),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No prompts matched these filters.
                </p>
              )}
            </div>
          </div>

          {renderDetailsPane({
            projectName,
            selectedPrompt,
            selectedDetails,
            isDetailsLoading,
            detailsError,
            formDraft,
            formError,
            isMutating,
            onStartEdit,
            onCancelForm,
            onFormChange,
            onSubmitForm,
            onDeletePrompt,
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
          {selectedPrompt?.path ? (
            <div className="mr-auto hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
              <Library className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{selectedPrompt.path}</span>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
