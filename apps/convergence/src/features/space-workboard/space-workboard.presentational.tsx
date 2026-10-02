import type { FC, ReactElement } from 'react'
import {
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  GitBranch,
  GitPullRequest,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import type {
  Space,
  SpaceAttempt,
  SpaceAttemptRole,
  SpaceAttention,
  SpaceArtifact,
  SpaceArtifactKind,
  SpaceArtifactStatus,
  SpaceSynthesisArtifactSuggestion,
  SpaceStatus,
} from '@/entities/space'
import {
  spaceAttemptRoleLabels,
  spaceAttemptRoleOptions,
  spaceArtifactKindLabels,
  spaceArtifactKindOptions,
  spaceArtifactStatusLabels,
  spaceArtifactStatusOptions,
} from '@/entities/space'
import {
  Badge,
  Button,
  buttonVariants,
  cn,
  EmptyState,
  Field,
  FieldError,
  FieldLabel,
  FormDialog,
  IconButton,
  Input,
  ListRow,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toneInk,
  tooltipAttributes,
} from '@convergence/ui'
import {
  SELECT_EMPTY_VALUE,
  fromSelectValue,
  toSelectValue,
} from '@/shared/lib/select-value.pure'
import {
  fieldCaption,
  metricCard,
  noteCard,
  rowActions,
  rowCaption,
  rowCard,
  rowTop,
  sectionHead,
  spaceAttentionLabels,
  spaceAttentionOptions,
  spaceStatusLabels,
  spaceStatusOptions,
  suggestionBox,
  suggestionRow,
} from './space-workboard.styles'
import type { SpaceArtifactSuggestion } from './space-artifact-suggestions.pure'

export interface SpaceDraft {
  title: string
  status: SpaceStatus
  attention: SpaceAttention
  brief: string
}

export interface SpaceArtifactDraft {
  kind: SpaceArtifactKind
  label: string
  value: string
  status: SpaceArtifactStatus
  sourceSessionId: string
}

export interface SpaceAttemptView {
  attempt: SpaceAttempt
  sessionName: string
  projectName: string
  branchName: string | null
  workingDirectory: string | null
  providerId: string
  status: string
  attention: string
  missing: boolean
}

export interface SpaceSynthesisArtifactSuggestionView extends SpaceSynthesisArtifactSuggestion {
  id: string
}

export interface SpaceSynthesisPreview {
  brief: string
  decisions: string[]
  openQuestions: string[]
  nextAction: string
  artifacts: SpaceSynthesisArtifactSuggestionView[]
}

interface SpaceWorkboardProps {
  open: boolean
  trigger?: ReactElement
  spaces: Space[]
  selectedSpace: Space | null
  selectedDraft: SpaceDraft
  selectedAttempts: SpaceAttemptView[]
  selectedArtifacts: SpaceArtifact[]
  artifactSuggestions: SpaceArtifactSuggestion[]
  synthesisPreview: SpaceSynthesisPreview | null
  artifactDraft: SpaceArtifactDraft
  artifactDialogOpen: boolean
  createTitle: string
  attemptCounts: Record<string, number>
  artifactCounts: Record<string, number>
  isLoading: boolean
  isCreating: boolean
  isCreatingArtifact: boolean
  isDiscoveringArtifacts: boolean
  isSynthesizing: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateTitleChange: (value: string) => void
  onCreate: () => void
  onSelectSpace: (id: string) => void
  /** A change to the Space's own fields; it is kept as it is made (R6). */
  onDraftChange: (draft: SpaceDraft) => void
  onArtifactDraftChange: (draft: SpaceArtifactDraft) => void
  onArtifactDialogOpenChange: (open: boolean) => void
  onCreateArtifact: () => void
  onArtifactKindChange: (artifactId: string, kind: SpaceArtifactKind) => void
  onArtifactStatusChange: (
    artifactId: string,
    status: SpaceArtifactStatus,
  ) => void
  onArtifactSourceSessionChange: (
    artifactId: string,
    sourceSessionId: string,
  ) => void
  onArtifactLabelCommit: (artifactId: string, label: string) => void
  onArtifactValueCommit: (artifactId: string, value: string) => void
  onDeleteArtifact: (artifactId: string) => void
  onDiscoverArtifacts: () => void
  onAcceptArtifactSuggestion: (suggestionId: string) => void
  onDismissArtifactSuggestion: (suggestionId: string) => void
  onSynthesize: () => void
  onSynthesisBriefChange: (value: string) => void
  onAcceptSynthesisBrief: () => void
  onRejectSynthesisBrief: () => void
  onAppendSynthesisNotes: () => void
  onAcceptSynthesisArtifact: (suggestionId: string) => void
  onDismissSynthesisPreview: () => void
  onAttemptRoleChange: (attemptId: string, role: SpaceAttemptRole) => void
  onSetPrimaryAttempt: (attemptId: string) => void
  onDetachAttempt: (attemptId: string) => void
}

export const SpaceWorkboardDialog: FC<SpaceWorkboardProps> = ({
  open,
  trigger,
  spaces,
  selectedSpace,
  selectedDraft,
  selectedAttempts,
  selectedArtifacts,
  artifactSuggestions,
  synthesisPreview,
  artifactDraft,
  artifactDialogOpen,
  createTitle,
  attemptCounts,
  artifactCounts,
  isLoading,
  isCreating,
  isCreatingArtifact,
  isDiscoveringArtifacts,
  isSynthesizing,
  error,
  onOpenChange,
  onCreateTitleChange,
  onCreate,
  onSelectSpace,
  onDraftChange,
  onArtifactDraftChange,
  onArtifactDialogOpenChange,
  onCreateArtifact,
  onArtifactKindChange,
  onArtifactStatusChange,
  onArtifactSourceSessionChange,
  onArtifactLabelCommit,
  onArtifactValueCommit,
  onDeleteArtifact,
  onDiscoverArtifacts,
  onAcceptArtifactSuggestion,
  onDismissArtifactSuggestion,
  onSynthesize,
  onSynthesisBriefChange,
  onAcceptSynthesisBrief,
  onRejectSynthesisBrief,
  onAppendSynthesisNotes,
  onAcceptSynthesisArtifact,
  onDismissSynthesisPreview,
  onAttemptRoleChange,
  onSetPrimaryAttempt,
  onDetachAttempt,
}) => {
  const createDisabled = createTitle.trim().length === 0 || isCreating
  const titleMissing = selectedDraft.title.trim().length === 0

  return (
    // Every edit here is kept as it is made (R6): the Space's own fields too,
    // so the dialog ends in Done, not in a Save that was the only way out.
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title="Spaces"
      description="Global work tracking for agent-driven delivery."
      size="xl"
      height="tall"
      flush
      saves="as-you-go"
      error={error}
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="flex min-h-0 flex-col border-b border-line-soft md:w-80 md:shrink-0 md:border-r md:border-b-0">
          <div className="border-b border-line-soft p-4">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (!createDisabled) onCreate()
              }}
            >
              <Input
                size="lg"
                value={createTitle}
                onChange={(event) => onCreateTitleChange(event.target.value)}
                placeholder="New Space"
                disabled={isCreating}
                aria-label="New Space title"
              />
              <IconButton
                label="Create Space"
                type="submit"
                variant="secondary"
                disabled={createDisabled}
                size="lg"
              >
                <Plus className="size-4" />
              </IconButton>
            </form>
          </div>

          <div className="app-scrollbar max-h-64 min-h-0 overflow-y-auto p-2 md:max-h-none md:flex-1">
            {isLoading && spaces.length === 0 ? (
              <EmptyState
                variant="plain"
                state="loading"
                title="Loading Spaces…"
              />
            ) : spaces.length === 0 ? (
              <EmptyState
                variant="plain"
                title="No Spaces yet"
                detail="Name one above to start."
              />
            ) : (
              <div className="space-y-1">
                {spaces.map((space) => (
                  <ListRow
                    key={space.id}
                    render={
                      <button
                        type="button"
                        onClick={() => onSelectSpace(space.id)}
                      />
                    }
                    selected={selectedSpace?.id === space.id}
                    title={space.title}
                    // Its status in words: a tag hue's tint would fail its
                    // contrast on the chosen row's fill (R7), and the board
                    // reads the same either way.
                    meta={
                      <>
                        <span>{spaceStatusLabels[space.status]}</span>
                        {space.attention !== 'none' ? (
                          <span>{spaceAttentionLabels[space.attention]}</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1">
                          <FileText aria-hidden className="size-3.5" />
                          {attemptCounts[space.id] ?? 0}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <GitPullRequest aria-hidden className="size-3.5" />
                          {artifactCounts[space.id] ?? 0}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock aria-hidden className="size-3.5" />
                          {formatUpdatedAt(space.updatedAt)}
                        </span>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {selectedSpace ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row">
                <Field invalid={titleMissing} className="md:flex-1">
                  <FieldLabel>Title</FieldLabel>
                  <Input
                    size="lg"
                    value={selectedDraft.title}
                    onChange={(event) =>
                      onDraftChange({
                        ...selectedDraft,
                        title: event.target.value,
                      })
                    }
                  />
                  {titleMissing ? (
                    <FieldError match reserve={false}>
                      A Space needs a title; nothing is saved without one.
                    </FieldError>
                  ) : null}
                </Field>

                <Field className="md:w-45 md:shrink-0">
                  <FieldLabel nativeLabel={false} render={<div />}>
                    Status
                  </FieldLabel>
                  <Select
                    items={spaceStatusLabels}
                    value={selectedDraft.status}
                    onValueChange={(status) =>
                      onDraftChange({
                        ...selectedDraft,
                        status: status as SpaceStatus,
                      })
                    }
                  >
                    <SelectTrigger
                      size="lg"
                      className="w-full"
                      aria-label="Status"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {spaceStatusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {spaceStatusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field className="md:w-45 md:shrink-0">
                  <FieldLabel nativeLabel={false} render={<div />}>
                    Attention
                  </FieldLabel>
                  <Select
                    items={spaceAttentionLabels}
                    value={selectedDraft.attention}
                    onValueChange={(attention) =>
                      onDraftChange({
                        ...selectedDraft,
                        attention: attention as SpaceAttention,
                      })
                    }
                  >
                    <SelectTrigger
                      size="lg"
                      className="w-full"
                      aria-label="Attention"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {spaceAttentionOptions.map((attention) => (
                        <SelectItem key={attention} value={attention}>
                          {spaceAttentionLabels[attention]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="space-y-2">
                <div className={sectionHead}>
                  <SectionLabel as="h3">Space brief</SectionLabel>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onSynthesize}
                    disabledReason={
                      selectedAttempts.length === 0
                        ? 'Link an Attempt to synthesize from first.'
                        : undefined
                    }
                    pending={isSynthesizing}
                    pendingLabel="Synthesizing…"
                    aria-label="Synthesize Space brief"
                  >
                    <RefreshCw className="size-4" />
                    Synthesize
                  </Button>
                </div>
                <Textarea
                  value={selectedDraft.brief}
                  onChange={(event) =>
                    onDraftChange({
                      ...selectedDraft,
                      brief: event.target.value,
                    })
                  }
                  className="min-h-55 resize-y"
                  placeholder="Stable notes, decisions, constraints, and next action."
                  aria-label="Space brief"
                />
              </div>

              {synthesisPreview ? (
                <section className={suggestionBox}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SectionLabel as="h4" className={toneInk.info}>
                        Suggested updates
                      </SectionLabel>
                      <p className="mt-1 text-xs text-ink-muted">
                        Review and accept only the parts that should become
                        stable Space state.
                      </p>
                    </div>
                    <IconButton
                      label="Dismiss synthesis preview"
                      type="button"
                      variant="secondary"
                      onClick={onDismissSynthesisPreview}
                      className="shrink-0"
                    >
                      <X className="size-4" />
                    </IconButton>
                  </div>

                  {synthesisPreview.brief ? (
                    <div className="space-y-2">
                      <SectionLabel>Proposed Space brief</SectionLabel>
                      <Textarea
                        value={synthesisPreview.brief}
                        onChange={(event) =>
                          onSynthesisBriefChange(event.target.value)
                        }
                        className="min-h-35 resize-y"
                        aria-label="Suggested Space brief"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={onRejectSynthesisBrief}
                        >
                          Reject
                        </Button>
                        <Button type="button" onClick={onAcceptSynthesisBrief}>
                          <Check className="size-4" />
                          Accept
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {renderSynthesisNotes({
                    preview: synthesisPreview,
                    onAppendSynthesisNotes,
                  })}

                  {synthesisPreview.artifacts.length > 0 ? (
                    <div className="space-y-2">
                      <SectionLabel>Proposed artifacts</SectionLabel>
                      {synthesisPreview.artifacts.map((artifact) => (
                        <div key={artifact.id} className={suggestionRow}>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {artifact.label}
                            </div>
                            <div className="mt-1 text-xs text-ink-muted">
                              {spaceArtifactKindLabels[artifact.kind]} |{' '}
                              {spaceArtifactStatusLabels[artifact.status]} |{' '}
                              {artifact.value}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              onAcceptSynthesisArtifact(artifact.id)
                            }
                          >
                            <Check className="size-4" />
                            Accept
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                {renderMetric('Attempts', attemptCounts[selectedSpace.id] ?? 0)}
                {renderMetric(
                  'Artifacts',
                  artifactCounts[selectedSpace.id] ?? 0,
                )}
                {renderMetric(
                  'Updated',
                  formatUpdatedAt(selectedSpace.updatedAt),
                )}
              </div>

              <section className="space-y-3">
                <SectionLabel as="h3">Attempts</SectionLabel>
                {selectedAttempts.length === 0 ? (
                  <EmptyState
                    title="No linked Attempts yet"
                    detail="Link a session to this Space from its header."
                  />
                ) : (
                  <div className="space-y-2">
                    {selectedAttempts.map((view) =>
                      renderAttemptRow({
                        view,
                        onAttemptRoleChange,
                        onSetPrimaryAttempt,
                        onDetachAttempt,
                      }),
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className={sectionHead}>
                  <SectionLabel as="h3">Artifacts</SectionLabel>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onDiscoverArtifacts}
                      disabledReason={
                        selectedAttempts.length === 0
                          ? 'Link an Attempt to discover from first.'
                          : undefined
                      }
                      pending={isDiscoveringArtifacts}
                      pendingLabel="Checking…"
                    >
                      <RefreshCw className="size-4" />
                      Discover
                    </Button>
                    {renderAddArtifact({
                      open: artifactDialogOpen,
                      artifactDraft,
                      attempts: selectedAttempts,
                      isCreatingArtifact,
                      onOpenChange: onArtifactDialogOpenChange,
                      onArtifactDraftChange,
                      onCreateArtifact,
                    })}
                  </div>
                </div>

                {artifactSuggestions.length > 0 ? (
                  <div className="space-y-2">
                    <SectionLabel>Suggestions</SectionLabel>
                    {artifactSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className={suggestionBox}>
                        <div className={rowTop}>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {suggestion.title}
                            </div>
                            <div className="mt-1 text-xs text-ink-muted">
                              {suggestion.description}
                            </div>
                          </div>
                          <div className={rowActions}>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                onAcceptArtifactSuggestion(suggestion.id)
                              }
                            >
                              <Check className="size-4" />
                              Accept
                            </Button>
                            <IconButton
                              label={`Dismiss ${suggestion.title}`}
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                onDismissArtifactSuggestion(suggestion.id)
                              }
                            >
                              <X className="size-4" />
                            </IconButton>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {selectedArtifacts.length === 0 ? (
                  <EmptyState
                    title="No Artifacts yet"
                    detail="Add one, or discover them from the Attempts."
                  />
                ) : (
                  <div className="space-y-2">
                    {selectedArtifacts.map((artifact) =>
                      renderArtifactRow({
                        artifact,
                        attempts: selectedAttempts,
                        onArtifactKindChange,
                        onArtifactStatusChange,
                        onArtifactSourceSessionChange,
                        onArtifactLabelCommit,
                        onArtifactValueCommit,
                        onDeleteArtifact,
                      }),
                    )}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <EmptyState
              variant="plain"
              layout="centred"
              title="No Space selected"
              detail="Select or create a Space."
            />
          )}
        </section>
      </div>
    </FormDialog>
  )
}

/** The Add Artifact dialog: a form over the Spaces, kept on Create (R6). */
function renderAddArtifact(input: {
  open: boolean
  artifactDraft: SpaceArtifactDraft
  attempts: SpaceAttemptView[]
  isCreatingArtifact: boolean
  onOpenChange: (open: boolean) => void
  onArtifactDraftChange: (draft: SpaceArtifactDraft) => void
  onCreateArtifact: () => void
}) {
  const {
    open,
    artifactDraft,
    attempts,
    isCreatingArtifact,
    onOpenChange,
    onArtifactDraftChange,
    onCreateArtifact,
  } = input
  const missing =
    artifactDraft.label.trim().length === 0
      ? 'Give the Artifact a label first.'
      : artifactDraft.value.trim().length === 0
        ? 'Give the Artifact a value first.'
        : undefined
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button type="button" variant="secondary">
          <Plus className="size-4" />
          Add Artifact…
        </Button>
      }
      title="Add Artifact"
      description="Attach a concrete artifact produced by this Space."
      saves="on-save"
      onSave={onCreateArtifact}
      saveLabel="Add Artifact"
      pendingLabel="Adding…"
      pending={isCreatingArtifact}
      saveDisabledReason={missing}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className={fieldCaption}>Kind</span>
          <Select
            items={spaceArtifactKindLabels}
            value={artifactDraft.kind}
            onValueChange={(kind) =>
              onArtifactDraftChange({
                ...artifactDraft,
                kind: kind as SpaceArtifactKind,
              })
            }
          >
            <SelectTrigger
              size="lg"
              className="w-full"
              aria-label="New Artifact kind"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spaceArtifactKindOptions.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {spaceArtifactKindLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldCaption}>Label</span>
          <Input
            size="lg"
            value={artifactDraft.label}
            onChange={(event) =>
              onArtifactDraftChange({
                ...artifactDraft,
                label: event.target.value,
              })
            }
            placeholder="Public PR"
            aria-label="New Artifact label"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldCaption}>Status</span>
          <Select
            items={spaceArtifactStatusLabels}
            value={artifactDraft.status}
            onValueChange={(status) =>
              onArtifactDraftChange({
                ...artifactDraft,
                status: status as SpaceArtifactStatus,
              })
            }
          >
            <SelectTrigger
              size="lg"
              className="w-full"
              aria-label="New Artifact status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spaceArtifactStatusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {spaceArtifactStatusLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldCaption}>Source</span>
          {renderSourceSelect({
            attempts,
            value: artifactDraft.sourceSessionId,
            onChange: (sourceSessionId) =>
              onArtifactDraftChange({ ...artifactDraft, sourceSessionId }),
            label: 'New Artifact source session',
          })}
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <span className={fieldCaption}>Value</span>
          <Input
            size="lg"
            value={artifactDraft.value}
            onChange={(event) =>
              onArtifactDraftChange({
                ...artifactDraft,
                value: event.target.value,
              })
            }
            placeholder="URL, branch, file path, or note"
            aria-label="New Artifact value"
          />
        </div>
      </div>
    </FormDialog>
  )
}

/** A source-session choice's labels: none, or one of the Space's attempts. */
function sourceSessionItems(attempts: SpaceAttemptView[]) {
  return {
    [SELECT_EMPTY_VALUE]: 'No source Attempt',
    ...Object.fromEntries(
      attempts.map((view) => [view.attempt.sessionId, view.sessionName]),
    ),
  }
}

/** Which Attempt an Artifact came from, or none. */
function renderSourceSelect(input: {
  attempts: SpaceAttemptView[]
  value: string
  onChange: (sourceSessionId: string) => void
  label: string
}) {
  const { attempts, value, onChange, label } = input
  return (
    <Select
      items={sourceSessionItems(attempts)}
      value={toSelectValue(value)}
      onValueChange={(sourceSessionId) =>
        onChange(fromSelectValue(sourceSessionId))
      }
    >
      <SelectTrigger size="lg" className="w-full" aria-label={label}>
        <SelectValue placeholder="No source Attempt" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SELECT_EMPTY_VALUE}>No source Attempt</SelectItem>
        {attempts.map((view) => (
          <SelectItem
            key={view.attempt.sessionId}
            value={view.attempt.sessionId}
          >
            {view.sessionName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function renderSynthesisNotes(input: {
  preview: SpaceSynthesisPreview
  onAppendSynthesisNotes: () => void
}) {
  const { preview, onAppendSynthesisNotes } = input
  const sections = [
    { label: 'Decisions', values: preview.decisions },
    { label: 'Open questions', values: preview.openQuestions },
    {
      label: 'Next action',
      values: preview.nextAction ? [preview.nextAction] : [],
    },
  ].filter((section) => section.values.length > 0)

  if (sections.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onAppendSynthesisNotes}
        >
          <Check className="size-4" />
          Append to Space brief
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {sections.map((section) => (
          <div key={section.label} className={noteCard}>
            <SectionLabel>{section.label}</SectionLabel>
            <ul className="mt-2 space-y-1 text-xs text-ink-muted">
              {section.values.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderMetric(label: string, value: string | number) {
  return (
    <div className={metricCard}>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1 truncate text-sm">{value}</div>
    </div>
  )
}

function renderAttemptRow(input: {
  view: SpaceAttemptView
  onAttemptRoleChange: (attemptId: string, role: SpaceAttemptRole) => void
  onSetPrimaryAttempt: (attemptId: string) => void
  onDetachAttempt: (attemptId: string) => void
}) {
  const { view, onAttemptRoleChange, onSetPrimaryAttempt, onDetachAttempt } =
    input
  const { attempt } = view

  return (
    <div key={attempt.id} className={rowCard}>
      <div className={rowTop}>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {view.sessionName}
            </span>
            {attempt.isPrimary ? (
              <Badge tone="warning" icon={<Star />}>
                Primary
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>{view.projectName}</span>
            {view.branchName ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3.5" />
                {view.branchName}
              </span>
            ) : null}
            <span>{view.providerId}</span>
            <span>{view.status}</span>
            {view.attention !== 'none' ? <span>{view.attention}</span> : null}
            {view.missing ? <span>Missing session</span> : null}
          </div>
        </div>

        <div className={rowActions}>
          <Select
            items={spaceAttemptRoleLabels}
            value={attempt.role}
            onValueChange={(role) =>
              onAttemptRoleChange(attempt.id, role as SpaceAttemptRole)
            }
          >
            <SelectTrigger
              size="md"
              aria-label={`Role for ${view.sessionName}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spaceAttemptRoleOptions.map((role) => (
                <SelectItem key={role} value={role}>
                  {spaceAttemptRoleLabels[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSetPrimaryAttempt(attempt.id)}
            disabled={attempt.isPrimary}
          >
            <Star className="size-4" />
            Primary
          </Button>
          <IconButton
            label={`Detach ${view.sessionName}`}
            type="button"
            variant="secondary"
            onClick={() => onDetachAttempt(attempt.id)}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

function renderArtifactRow(input: {
  artifact: SpaceArtifact
  attempts: SpaceAttemptView[]
  onArtifactKindChange: (artifactId: string, kind: SpaceArtifactKind) => void
  onArtifactStatusChange: (
    artifactId: string,
    status: SpaceArtifactStatus,
  ) => void
  onArtifactSourceSessionChange: (
    artifactId: string,
    sourceSessionId: string,
  ) => void
  onArtifactLabelCommit: (artifactId: string, label: string) => void
  onArtifactValueCommit: (artifactId: string, value: string) => void
  onDeleteArtifact: (artifactId: string) => void
}) {
  const {
    artifact,
    attempts,
    onArtifactKindChange,
    onArtifactStatusChange,
    onArtifactSourceSessionChange,
    onArtifactLabelCommit,
    onArtifactValueCommit,
    onDeleteArtifact,
  } = input
  const sourceAttempt = attempts.find(
    (view) => view.attempt.sessionId === artifact.sourceSessionId,
  )
  const artifactUrl = parseHttpUrl(artifact.value)

  return (
    <div key={artifact.id} className={rowCard}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex flex-col gap-1.5  md:w-37.5 md:shrink-0">
          <span className={rowCaption}>Kind</span>
          <Select
            items={spaceArtifactKindLabels}
            value={artifact.kind}
            onValueChange={(kind) =>
              onArtifactKindChange(artifact.id, kind as SpaceArtifactKind)
            }
          >
            <SelectTrigger
              size="md"
              className="w-full"
              aria-label={`Kind for ${artifact.label}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spaceArtifactKindOptions.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {spaceArtifactKindLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 md:flex-1">
          <span className={rowCaption}>Label</span>
          <Input
            size="lg"
            defaultValue={artifact.label}
            onBlur={(event) => {
              const label = event.target.value.trim()
              if (label && label !== artifact.label) {
                onArtifactLabelCommit(artifact.id, label)
              }
            }}
            aria-label={`Label for ${artifact.label}`}
          />
        </div>

        <div className="flex flex-col gap-1.5  md:w-40 md:shrink-0">
          <span className={rowCaption}>Status</span>
          <Select
            items={spaceArtifactStatusLabels}
            value={artifact.status}
            onValueChange={(status) =>
              onArtifactStatusChange(artifact.id, status as SpaceArtifactStatus)
            }
          >
            <SelectTrigger
              size="md"
              className="w-full"
              aria-label={`Status for ${artifact.label}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spaceArtifactStatusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {spaceArtifactStatusLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <IconButton
          label={`Remove Artifact ${artifact.label}`}
          type="button"
          variant="secondary"
          onClick={() => onDeleteArtifact(artifact.id)}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      <div className="mt-3 flex flex-col gap-3 md:flex-row">
        <div className="flex flex-col gap-1.5 md:flex-1">
          <span className={rowCaption}>Value</span>
          <div className="flex gap-2">
            <Input
              size="lg"
              defaultValue={artifact.value}
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value && value !== artifact.value) {
                  onArtifactValueCommit(artifact.id, value)
                }
              }}
              aria-label={`Value for ${artifact.label}`}
            />
            {artifactUrl ? (
              // A link that looks like an icon button: it goes somewhere,
              // so it stays a link (MAR-3616).
              <a
                href={artifactUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open Artifact ${artifact.label}`}
                {...tooltipAttributes(`Open Artifact ${artifact.label}`)}
                className={cn(
                  buttonVariants({
                    variant: 'ghost',
                    size: 'lg',
                    shape: 'icon',
                  }),
                  'shrink-0',
                )}
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5  md:w-47.5 md:shrink-0">
          <span className={rowCaption}>Source</span>
          {renderSourceSelect({
            attempts,
            value: artifact.sourceSessionId ?? '',
            onChange: (sourceSessionId) =>
              onArtifactSourceSessionChange(artifact.id, sourceSessionId),
            label: `Source for ${artifact.label}`,
          })}
        </div>
      </div>

      {sourceAttempt ? (
        <div className="mt-2 text-xs text-ink-muted">
          Source: {sourceAttempt.sessionName}
        </div>
      ) : null}
    </div>
  )
}

function parseHttpUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
