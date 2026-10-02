import type { FC, ReactElement } from 'react'
import {
  BookOpenText,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
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
import {
  dialogPane,
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Field,
  FieldLabel,
  FormDialog,
  FormError,
  IconButton,
  Input,
  ListRow,
  Notice,
  SearchField,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
} from '@convergence/ui'
import { Markdown } from '@/shared/ui'
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
  /** What opens it; left out where the dialog store opens it (the sidebar's menus). */
  trigger?: ReactElement
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
  /** The key that also saves the form, in words ("⌘↵"), for Save's tooltip. */
  submitShortcut?: string
  onDeletePrompt: (prompt: PromptLibraryEntry) => void
}

/** Why a prompt's buttons wait while a change saves (R2, DLG §4 13). */
const SAVING_REASON = 'Wait for the last change to save.'

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
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Field className="min-w-0 flex-1 gap-1">
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

function renderPromptRow(
  prompt: PromptLibraryEntry,
  selectedPromptId: string | null,
  onSelectPrompt: (promptId: string) => void,
) {
  return (
    <ListRow
      key={prompt.id}
      render={
        <button type="button" onClick={() => onSelectPrompt(prompt.id)} />
      }
      selected={prompt.id === selectedPromptId}
      title={prompt.title}
      marks={<Badge>{prompt.sourceLabel}</Badge>}
      meta={
        <>
          <span>{KIND_LABELS[prompt.kind]}</span>
          {prompt.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          <span>
            {prompt.shortDescription ||
              prompt.description ||
              prompt.relativePath}
          </span>
        </>
      }
    />
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
  submitShortcut,
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
  | 'submitShortcut'
  | 'onDeletePrompt'
>) {
  if (!projectName) {
    return (
      <EmptyState
        variant="plain"
        layout="centred"
        title="No project open"
        detail="Open a project to inspect prompts."
      />
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
      submitShortcut,
    })
  }

  if (!selectedPrompt) {
    return (
      <EmptyState
        variant="plain"
        layout="centred"
        title="No prompt selected"
        detail="Choose one from the list."
      />
    )
  }

  return (
    <div className={dialogPane}>
      <div className="mb-4 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>{SCOPE_LABELS[selectedPrompt.scope]}</Badge>
            <Badge>{KIND_LABELS[selectedPrompt.kind]}</Badge>
          </div>
          <h3 className="truncate text-lg font-semibold">
            {selectedPrompt.title}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            {selectedPrompt.description || selectedPrompt.relativePath}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {selectedDetails ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onStartEdit(selectedPrompt)}
              disabledReason={isMutating ? SAVING_REASON : undefined}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          ) : null}
          <Button
            type="button"
            variant="danger-quiet"
            onClick={() => onDeletePrompt(selectedPrompt)}
            disabledReason={isMutating ? SAVING_REASON : undefined}
          >
            <Trash2 className="size-3.5" />
            Delete…
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card render={<section />}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionLabel as="h4">Path</SectionLabel>
            <CopyButton text={selectedPrompt.path} label="Copy prompt path" />
          </div>
          <p className="font-mono text-xs break-all text-ink-muted">
            {selectedPrompt.path}
          </p>
        </Card>

        {selectedPrompt.tags.length > 0 ? (
          <Card render={<section />}>
            <SectionLabel as="h4" className="mb-2">
              Tags
            </SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {selectedPrompt.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </Card>
        ) : null}

        {isDetailsLoading ? (
          <EmptyState state="loading" title="Loading the prompt…" />
        ) : null}

        {detailsError ? <Notice tone="danger" title={detailsError} /> : null}

        {selectedDetails ? (
          <>
            <Card render={<section />}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <SectionLabel as="h4">Prompt text</SectionLabel>
                <CopyButton
                  text={selectedDetails.promptText}
                  label="Copy prompt text"
                />
              </div>
              {/* The prompt's own text: it scrolls, so the keyboard can reach it. */}
              {/* raw-element: a prompt is prose, kept in the body font as it was written; CodeBlock is monospace */}
              <pre
                tabIndex={0}
                aria-label="Prompt text"
                className="max-h-60 overflow-auto rounded-md border border-line-soft bg-canvas/60 p-3 text-xs leading-5 whitespace-pre-wrap text-ink"
              >
                {selectedDetails.promptText}
              </pre>
            </Card>

            <Card render={<section />} padding="md" surface="raised">
              <div className="mb-3 flex items-center gap-2 border-b border-line-soft pb-3">
                <FileText className="size-4 text-ink-muted" />
                <h4 className="text-sm font-medium">Preview</h4>
                <span className="ml-auto text-xs text-ink-muted">
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

function renderPromptForm({
  draft,
  error,
  isMutating,
  onCancel,
  onChange,
  onSubmit,
  submitShortcut,
}: {
  draft: PromptLibraryFormDraft
  error: string | null
  isMutating: boolean
  onCancel: () => void
  onChange: (patch: Partial<PromptLibraryFormDraft>) => void
  onSubmit: () => void
  submitShortcut?: string
}) {
  return (
    <div className={dialogPane}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            {draft.mode === 'create' ? 'New prompt' : 'Edit prompt'}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            Prompt text is stored as a file; metadata is tracked by Convergence.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabledReason={isMutating ? SAVING_REASON : undefined}
          >
            <X className="size-3.5" />
            Cancel
          </Button>
          <Tooltip
            label={submitShortcut ? 'Save' : undefined}
            shortcut={submitShortcut}
          >
            <Button
              type="button"
              onClick={onSubmit}
              pending={isMutating}
              pendingLabel="Saving…"
            >
              <Save className="size-3.5" />
              Save
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Title</FieldLabel>
            <Input
              size="lg"
              value={draft.title}
              onChange={(event) =>
                onChange({ title: event.currentTarget.value })
              }
              placeholder="PR Review"
            />
          </Field>
          <Field>
            <FieldLabel>Tags</FieldLabel>
            <Input
              size="lg"
              value={draft.tagsText}
              onChange={(event) =>
                onChange({ tagsText: event.currentTarget.value })
              }
              placeholder="review, github"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel nativeLabel={false} render={<div />}>
              Scope
            </FieldLabel>
            <Select
              items={SCOPE_LABELS}
              value={draft.scope}
              onValueChange={(scope) =>
                onChange({ scope: scope as PromptLibraryScope })
              }
              disabled={draft.mode === 'edit'}
            >
              <SelectTrigger size="lg" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="global">Global</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel nativeLabel={false} render={<div />}>
              File kind
            </FieldLabel>
            <Select
              items={KIND_LABELS}
              value={draft.kind}
              onValueChange={(kind) =>
                onChange({
                  kind: kind as PromptLibraryEntry['kind'],
                })
              }
              disabled={draft.mode === 'edit'}
            >
              <SelectTrigger size="lg" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {draft.mode === 'create' ? (
          <Field>
            <FieldLabel>Filename</FieldLabel>
            <Input
              size="lg"
              value={draft.filename}
              onChange={(event) =>
                onChange({ filename: event.currentTarget.value })
              }
              placeholder="Optional; generated from title"
            />
          </Field>
        ) : null}

        <Field>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            value={draft.description}
            onChange={(event) =>
              onChange({ description: event.currentTarget.value })
            }
            className="min-h-20"
            placeholder="What this prompt is for"
          />
        </Field>

        <Field>
          <FieldLabel>Prompt text</FieldLabel>
          <Textarea
            value={draft.promptText}
            onChange={(event) =>
              onChange({ promptText: event.currentTarget.value })
            }
            density="compact"
            className="min-h-72 font-mono leading-5"
            placeholder="Write the prompt text to copy into the composer"
          />
        </Field>

        <FormError>{error}</FormError>
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
  submitShortcut,
  onDeletePrompt,
}) => {
  const selectedPromptId = selectedPrompt?.id ?? null
  const hasCatalog = Boolean(catalog)

  return (
    // Creating, editing and deleting a prompt is kept as it is done, so the
    // library ends in Done; Refresh and New live in the header (R6).
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={
        <span className="flex items-center gap-2">
          <BookOpenText aria-hidden className="size-5 text-ink-muted" />
          Prompt library
        </span>
      }
      description={
        projectName
          ? `${filteredPromptCount}/${totalPromptCount} prompts in ${projectName}.`
          : 'Select a project to browse saved prompts.'
      }
      size="2xl"
      height="tall"
      flush
      saves="as-you-go"
      headerActions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onStartCreate}
            disabledReason={
              !projectName
                ? 'Open a project first.'
                : isMutating
                  ? SAVING_REASON
                  : undefined
            }
          >
            <Plus className="size-3.5" />
            New
          </Button>
          <IconButton
            label="Refresh"
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            pending={isCatalogLoading}
            disabledReason={projectName ? undefined : 'Open a project first.'}
          >
            <RefreshCw />
          </IconButton>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-col border-b border-line-soft lg:w-97.5 lg:shrink-0 lg:border-r lg:border-b-0">
          <div className="shrink-0 border-b border-line-soft p-4">
            <SearchField
              size="lg"
              value={filters.query}
              onChange={(event) =>
                onFiltersChange({ query: event.currentTarget.value })
              }
              onClear={() => onFiltersChange({ query: '' })}
              clearLabel="Clear the prompt search"
              placeholder="Search prompts"
              aria-label="Search prompts"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {renderSelectControl({
                label: 'Scope',
                value: filters.scope,
                onChange: (value) =>
                  onFiltersChange({
                    scope: value as PromptLibraryBrowserFilters['scope'],
                  }),
                options: [
                  { value: 'all', label: 'All scopes' },
                  { value: 'project', label: 'Project' },
                  { value: 'global', label: 'Global' },
                ],
              })}
              {renderSelectControl({
                label: 'Kind',
                value: filters.kind,
                onChange: (value) =>
                  onFiltersChange({
                    kind: value as PromptLibraryBrowserFilters['kind'],
                  }),
                options: [
                  { value: 'all', label: 'All files' },
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'text', label: 'Text' },
                ],
              })}
              {renderSelectControl({
                label: 'Tag',
                value: filters.tag,
                onChange: (value) => onFiltersChange({ tag: value }),
                options: [
                  { value: 'all', label: 'All tags' },
                  ...tagOptions.map((tag) => ({ value: tag, label: tag })),
                ],
              })}
            </div>
          </div>

          <div className="h-130 overflow-y-auto p-4 lg:h-auto lg:min-h-0 lg:flex-1">
            {!projectName ? (
              <EmptyState
                title="No project open"
                detail="Open a project to browse prompts."
              />
            ) : catalogError && !hasCatalog ? (
              <EmptyState
                state="failed"
                title="Couldn’t read the prompts"
                detail={catalogError}
                onRetry={onRefresh}
                retrying={isCatalogLoading}
              />
            ) : isCatalogLoading && !hasCatalog ? (
              <EmptyState state="loading" title="Loading prompts…" />
            ) : hasCatalog && catalog?.prompts.length === 0 ? (
              <EmptyState
                title="No prompts yet"
                detail="Add Markdown or text files under .convergence/prompts, or make one here."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onStartCreate}
                    disabledReason={isMutating ? SAVING_REASON : undefined}
                  >
                    <Plus className="size-3.5" />
                    New prompt
                  </Button>
                }
              />
            ) : prompts.length > 0 ? (
              <div className="space-y-1">
                {prompts.map((prompt) =>
                  renderPromptRow(prompt, selectedPromptId, onSelectPrompt),
                )}
              </div>
            ) : (
              <EmptyState
                title="No prompts match these filters"
                detail="Clear the search or widen a filter."
              />
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
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
            submitShortcut,
            onDeletePrompt,
          })}
        </div>
      </div>
    </FormDialog>
  )
}
