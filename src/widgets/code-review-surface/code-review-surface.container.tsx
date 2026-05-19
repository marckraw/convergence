import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import type { SelectedLineRange } from '@pierre/diffs'
import {
  buildCodeReviewFilePatchKey,
  buildCodeReviewSummaryKey,
  countCodeReviewFilesByStatus,
  selectCodeReviewFileAfterReload,
  useCodeReviewStore,
  type CodeReviewMode,
  type CodeReviewTarget,
} from '@/entities/code-review'
import { useProjectStore } from '@/entities/project'
import {
  selectReviewNotesForSession,
  useReviewNoteStore,
  type ReviewNote,
} from '@/entities/review-note'
import { useSessionStore } from '@/entities/session'
import {
  buildFileLevelReviewNoteDiff,
  countDraftReviewNotes,
  countReviewNotesByFile,
  countReviewNotesByState,
  filterReviewNotes,
  findReviewNoteDiffLineIds,
  getReviewNoteAnnotationElementId,
  groupReviewNotesByFile,
  mapReviewNotesToDiffAnnotations,
  type ReviewNoteDiffAnnotation as ReviewNoteDiffAnnotationModel,
  type ReviewNoteFilter,
} from '@/features/code-review-notes'
import {
  mapDiffLineIdsToPierreSelection,
  mapPierreSelectionToDiffLineIds,
  parseUnifiedDiffForReviewAnchors,
  PierreDiffViewer,
  ReviewNoteDiffAnnotation as ReviewNoteDiffAnnotationView,
  summarizeSelectedDiffLines,
} from '@/widgets/session-view'
import { CodeReviewFileRail } from './code-review-file-rail.presentational'
import { CodeReviewNotesRail } from './code-review-notes-rail.presentational'
import { CodeReviewTargetRail } from './code-review-target-rail.presentational'
import { CodeReviewToolbar } from './code-review-toolbar.presentational'

interface CodeReviewSurfaceProps {
  routeTargetId?: string | null
  routeMode?: CodeReviewMode
  routeFilePath?: string | null
  onRouteSearchChange?: (search: {
    targetId?: string | null
    mode?: CodeReviewMode
    file?: string | null
  }) => void
  onClose?: () => void
}

export const CodeReviewSurface: FC<CodeReviewSurfaceProps> = ({
  routeTargetId = null,
  routeMode = 'working-tree',
  routeFilePath = null,
  onRouteSearchChange,
  onClose,
}) => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const targets = useCodeReviewStore((state) => state.targets)
  const selectedTarget = useCodeReviewStore((state) => state.selectedTarget)
  const selectedMode = useCodeReviewStore((state) => state.selectedMode)
  const selectedFile = useCodeReviewStore((state) => state.selectedFile)
  const targetsLoading = useCodeReviewStore((state) => state.targetsLoading)
  const summariesByKey = useCodeReviewStore((state) => state.summariesByKey)
  const filePatchesByKey = useCodeReviewStore((state) => state.filePatchesByKey)
  const loadingSummaryKeys = useCodeReviewStore(
    (state) => state.loadingSummaryKeys,
  )
  const loadingFilePatchKeys = useCodeReviewStore(
    (state) => state.loadingFilePatchKeys,
  )
  const error = useCodeReviewStore((state) => state.error)
  const loadTargets = useCodeReviewStore((state) => state.loadTargets)
  const loadSummary = useCodeReviewStore((state) => state.loadSummary)
  const loadFilePatch = useCodeReviewStore((state) => state.loadFilePatch)
  const setSelectedTarget = useCodeReviewStore(
    (state) => state.setSelectedTarget,
  )
  const setSelectedMode = useCodeReviewStore((state) => state.setSelectedMode)
  const setSelectedFile = useCodeReviewStore((state) => state.setSelectedFile)
  const closeReview = useCodeReviewStore((state) => state.closeReview)
  const reviewNotes = useReviewNoteStore((state) =>
    selectReviewNotesForSession(state, selectedTarget?.sessionId),
  )
  const packetPreview = useReviewNoteStore((state) =>
    selectedTarget?.sessionId
      ? (state.packetPreviewBySessionId[selectedTarget.sessionId] ?? null)
      : null,
  )
  const reviewNotesError = useReviewNoteStore((state) => state.error)
  const loadReviewNotes = useReviewNoteStore((state) => state.loadBySession)
  const createReviewNote = useReviewNoteStore((state) => state.createNote)
  const updateReviewNote = useReviewNoteStore((state) => state.updateNote)
  const deleteReviewNote = useReviewNoteStore((state) => state.deleteNote)
  const previewReviewPacket = useReviewNoteStore((state) => state.previewPacket)
  const sendReviewPacket = useReviewNoteStore((state) => state.sendPacket)
  const [statusFilter, setStatusFilter] = useState('all')
  const [holdEmptySelection, setHoldEmptySelection] = useState(false)
  const [selectedDiffLineIds, setSelectedDiffLineIds] = useState<string[]>([])
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [noteDraftBody, setNoteDraftBody] = useState('')
  const [fileNoteComposerOpen, setFileNoteComposerOpen] = useState(false)
  const [fileNoteDraftBody, setFileNoteDraftBody] = useState('')
  const [reviewNoteFilter, setReviewNoteFilter] =
    useState<ReviewNoteFilter>('all')
  const [packetPreviewOpen, setPacketPreviewOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [activeReviewNoteId, setActiveReviewNoteId] = useState<string | null>(
    null,
  )
  const [pendingReviewNoteSelection, setPendingReviewNoteSelection] =
    useState<ReviewNote | null>(null)
  const lastAppliedRouteFilePathRef = useRef<string | null | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!activeProject) return
    void loadTargets({
      projectId: activeProject.id,
      sessionId: activeSessionId,
    })
  }, [activeProject, activeSessionId, loadTargets])

  useEffect(() => {
    if (selectedMode !== routeMode) {
      setSelectedMode(routeMode)
    }
  }, [routeMode, selectedMode, setSelectedMode])

  useEffect(() => {
    if (lastAppliedRouteFilePathRef.current === routeFilePath) return
    lastAppliedRouteFilePathRef.current = routeFilePath
    setSelectedFile(routeFilePath)
  }, [routeFilePath, setSelectedFile])

  useEffect(() => {
    if (!routeTargetId) return
    if (selectedTarget?.id === routeTargetId) return

    const nextTarget = targets.find((target) => target.id === routeTargetId)
    if (!nextTarget) return
    setSelectedTarget(nextTarget)
  }, [routeTargetId, selectedTarget?.id, setSelectedTarget, targets])

  useEffect(() => {
    if (selectedMode === 'base-branch' && !selectedTarget?.sessionId) {
      setSelectedMode('working-tree')
    }
  }, [selectedMode, selectedTarget?.sessionId, setSelectedMode])

  const summaryInput = useMemo(
    () =>
      selectedTarget ? { target: selectedTarget, mode: selectedMode } : null,
    [selectedMode, selectedTarget],
  )
  const summaryKey = summaryInput ? buildCodeReviewSummaryKey(summaryInput) : ''
  const summary = summaryKey ? (summariesByKey[summaryKey] ?? null) : null
  const summaryLoading = summaryKey
    ? (loadingSummaryKeys[summaryKey] ?? false)
    : false
  const files = summary?.files ?? []
  const statusCounts = useMemo(
    () => countCodeReviewFilesByStatus(files),
    [files],
  )
  const visibleFiles = useMemo(
    () =>
      statusFilter === 'all'
        ? files
        : files.filter((file) => file.status === statusFilter),
    [files, statusFilter],
  )
  const selectedVisibleFile = useMemo(
    () =>
      visibleFiles.some((file) => file.file === selectedFile)
        ? selectedFile
        : null,
    [selectedFile, visibleFiles],
  )
  const targetList = useMemo(
    () =>
      [...targets].sort((a, b) => {
        const changedDelta =
          b.status.workingTreeFileCount - a.status.workingTreeFileCount
        if (changedDelta !== 0) return changedDelta
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      }),
    [targets],
  )
  const patchInput = useMemo(
    () =>
      selectedTarget && selectedVisibleFile
        ? {
            target: selectedTarget,
            mode: selectedMode,
            filePath: selectedVisibleFile,
          }
        : null,
    [selectedMode, selectedTarget, selectedVisibleFile],
  )
  const patchKey = patchInput ? buildCodeReviewFilePatchKey(patchInput) : ''
  const diff = patchKey ? (filePatchesByKey[patchKey] ?? '') : ''
  const diffLoading = patchKey
    ? (loadingFilePatchKeys[patchKey] ?? false)
    : false
  const currentReviewNoteMode =
    selectedMode === 'base-branch' ? 'base-branch' : 'working-tree'
  const diffLines = useMemo(
    () => parseUnifiedDiffForReviewAnchors(diff),
    [diff],
  )
  const selectedDiffLineIdSet = useMemo(
    () => new Set(selectedDiffLineIds),
    [selectedDiffLineIds],
  )
  const selectedDiffLines = useMemo(
    () => diffLines.filter((line) => selectedDiffLineIdSet.has(line.id)),
    [diffLines, selectedDiffLineIdSet],
  )
  const selectedDiffSummary = useMemo(
    () =>
      summarizeSelectedDiffLines({
        lines: diffLines,
        selectedIds: selectedDiffLineIds,
      }),
    [diffLines, selectedDiffLineIds],
  )
  const selectedPierreLineRange = useMemo(
    () =>
      mapDiffLineIdsToPierreSelection({
        lines: diffLines,
        selectedIds: selectedDiffLineIds,
      }),
    [diffLines, selectedDiffLineIds],
  )
  const visibleReviewNotes = useMemo(
    () => filterReviewNotes(reviewNotes, reviewNoteFilter),
    [reviewNoteFilter, reviewNotes],
  )
  const reviewNoteGroups = useMemo(
    () => groupReviewNotesByFile(visibleReviewNotes),
    [visibleReviewNotes],
  )
  const reviewNoteStateCounts = useMemo(
    () => countReviewNotesByState(reviewNotes),
    [reviewNotes],
  )
  const draftReviewNoteCount = useMemo(
    () => countDraftReviewNotes(reviewNotes),
    [reviewNotes],
  )
  const reviewNoteCountByFile = useMemo(
    () => countReviewNotesByFile(reviewNotes),
    [reviewNotes],
  )
  const reviewNoteAnnotationMapping = useMemo(() => {
    if (diffLoading || diffLines.length === 0) {
      return {
        annotations: [],
        staleNoteIds: [],
      }
    }

    return mapReviewNotesToDiffAnnotations({
      notes: visibleReviewNotes,
      lines: diffLines,
      filePath: selectedVisibleFile,
      mode: currentReviewNoteMode,
      activeNoteId: activeReviewNoteId,
    })
  }, [
    activeReviewNoteId,
    currentReviewNoteMode,
    diffLines,
    diffLoading,
    selectedVisibleFile,
    visibleReviewNotes,
  ])
  const staleReviewNoteIdSet = useMemo(
    () => new Set(reviewNoteAnnotationMapping.staleNoteIds),
    [reviewNoteAnnotationMapping.staleNoteIds],
  )
  const renderReviewNoteAnnotation = useCallback(
    (annotation: ReviewNoteDiffAnnotationModel) => (
      <ReviewNoteDiffAnnotationView metadata={annotation.metadata} />
    ),
    [],
  )

  useEffect(() => {
    if (!summaryInput) return
    void loadSummary(summaryInput)
  }, [loadSummary, summaryInput])

  useEffect(() => {
    if (!selectedTarget?.sessionId) return
    void loadReviewNotes(selectedTarget.sessionId)
  }, [loadReviewNotes, selectedTarget?.sessionId])

  useEffect(() => {
    if (holdEmptySelection && selectedFile === null) return

    const nextFile = selectCodeReviewFileAfterReload({
      current: selectedFile,
      files: visibleFiles,
    })
    if (nextFile !== selectedFile) {
      setSelectedFile(nextFile)
    }
  }, [holdEmptySelection, selectedFile, setSelectedFile, visibleFiles])

  useEffect(() => {
    if (!patchInput) return
    void loadFilePatch(patchInput)
  }, [loadFilePatch, patchInput])

  useEffect(() => {
    setSelectedDiffLineIds([])
    setNoteComposerOpen(false)
    setNoteDraftBody('')
    setFileNoteComposerOpen(false)
    setFileNoteDraftBody('')
    setPacketPreviewOpen(false)
  }, [selectedTarget?.id, selectedMode, selectedFile, diff])

  useEffect(() => {
    if (!pendingReviewNoteSelection) return
    if (selectedMode !== pendingReviewNoteSelection.mode) return
    if (selectedVisibleFile !== pendingReviewNoteSelection.filePath) return
    if (diffLoading || diffLines.length === 0) return

    setSelectedDiffLineIds(
      findReviewNoteDiffLineIds({
        note: pendingReviewNoteSelection,
        lines: diffLines,
      }),
    )
    setPendingReviewNoteSelection(null)
  }, [
    diffLines,
    diffLoading,
    pendingReviewNoteSelection,
    selectedMode,
    selectedVisibleFile,
  ])

  useEffect(() => {
    if (!activeReviewNoteId || diffLoading) return

    const timeout = window.setTimeout(() => {
      const target = document.getElementById(
        getReviewNoteAnnotationElementId(activeReviewNoteId),
      )
      if (!target || typeof target.scrollIntoView !== 'function') return

      target.scrollIntoView({ block: 'center', inline: 'nearest' })
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [activeReviewNoteId, diffLoading, reviewNoteAnnotationMapping.annotations])

  const handleSelectTarget = useCallback(
    (target: CodeReviewTarget) => {
      setHoldEmptySelection(false)
      setSelectedTarget(target)
      setSelectedFile(null)
      setStatusFilter('all')
      onRouteSearchChange?.({ targetId: target.id, file: null })
    },
    [onRouteSearchChange, setSelectedFile, setSelectedTarget],
  )

  const handleModeChange = useCallback(
    (mode: CodeReviewMode) => {
      setHoldEmptySelection(false)
      setSelectedMode(mode)
      setSelectedFile(null)
      setStatusFilter('all')
      onRouteSearchChange?.({ mode, file: null })
    },
    [onRouteSearchChange, setSelectedFile, setSelectedMode],
  )

  const handleStatusFilterChange = useCallback(
    (nextFilter: string) => {
      setHoldEmptySelection(true)
      setStatusFilter(nextFilter)
      setSelectedFile(null)
      onRouteSearchChange?.({ file: null })
    },
    [onRouteSearchChange, setSelectedFile],
  )

  const handleSelectFile = useCallback(
    (filePath: string) => {
      if (visibleFiles.some((file) => file.file === filePath)) {
        setHoldEmptySelection(false)
        setSelectedFile(filePath)
        onRouteSearchChange?.({ file: filePath })
      }
    },
    [onRouteSearchChange, setSelectedFile, visibleFiles],
  )

  const handlePierreDiffSelection = useCallback(
    (range: SelectedLineRange | null) => {
      setSelectedDiffLineIds(
        mapPierreSelectionToDiffLineIds({
          lines: diffLines,
          range,
        }),
      )
    },
    [diffLines],
  )

  const handleCreateReviewNote = useCallback(async () => {
    if (
      !selectedTarget?.sessionId ||
      !selectedVisibleFile ||
      selectedDiffLines.length === 0
    ) {
      return
    }

    const created = await createReviewNote({
      sessionId: selectedTarget.sessionId,
      workspaceId: selectedTarget.workspaceId,
      filePath: selectedVisibleFile,
      mode: currentReviewNoteMode,
      oldStartLine: selectedDiffSummary.oldStartLine,
      oldEndLine: selectedDiffSummary.oldEndLine,
      newStartLine: selectedDiffSummary.newStartLine,
      newEndLine: selectedDiffSummary.newEndLine,
      hunkHeader:
        selectedDiffLines.find((line) => line.hunkHeader)?.hunkHeader ?? null,
      selectedDiff: selectedDiffLines.map((line) => line.text).join('\n'),
      body: noteDraftBody,
    })

    if (!created) return
    setNoteComposerOpen(false)
    setNoteDraftBody('')
    setSelectedDiffLineIds([])
  }, [
    createReviewNote,
    currentReviewNoteMode,
    noteDraftBody,
    selectedDiffLines,
    selectedDiffSummary.newEndLine,
    selectedDiffSummary.newStartLine,
    selectedDiffSummary.oldEndLine,
    selectedDiffSummary.oldStartLine,
    selectedTarget?.sessionId,
    selectedTarget?.workspaceId,
    selectedVisibleFile,
  ])

  const handleCreateFileReviewNote = useCallback(async () => {
    if (!selectedTarget?.sessionId || !selectedVisibleFile) return

    const created = await createReviewNote({
      sessionId: selectedTarget.sessionId,
      workspaceId: selectedTarget.workspaceId,
      filePath: selectedVisibleFile,
      mode: currentReviewNoteMode,
      oldStartLine: null,
      oldEndLine: null,
      newStartLine: null,
      newEndLine: null,
      hunkHeader: null,
      selectedDiff: buildFileLevelReviewNoteDiff(selectedVisibleFile),
      body: fileNoteDraftBody,
    })

    if (!created) return
    setFileNoteComposerOpen(false)
    setFileNoteDraftBody('')
  }, [
    createReviewNote,
    currentReviewNoteMode,
    fileNoteDraftBody,
    selectedTarget?.sessionId,
    selectedTarget?.workspaceId,
    selectedVisibleFile,
  ])

  const handleReviewNoteJump = useCallback(
    (note: ReviewNote) => {
      setActiveReviewNoteId(note.id)
      setPendingReviewNoteSelection(note)
      setNoteComposerOpen(false)
      setNoteDraftBody('')
      setFileNoteComposerOpen(false)
      setFileNoteDraftBody('')
      setSelectedDiffLineIds([])
      setHoldEmptySelection(false)

      if (selectedMode !== note.mode) {
        setSelectedMode(note.mode)
      }
      setSelectedFile(note.filePath)
    },
    [selectedMode, setSelectedFile, setSelectedMode],
  )

  const handleEditReviewNote = useCallback((note: ReviewNote) => {
    setEditingNoteId(note.id)
    setEditingBody(note.body)
  }, [])

  const handleSaveReviewNote = useCallback(
    async (noteId: string) => {
      const updated = await updateReviewNote(noteId, { body: editingBody })
      if (!updated) return
      setEditingNoteId(null)
      setEditingBody('')
    },
    [editingBody, updateReviewNote],
  )

  const handlePreviewReviewPacket = useCallback(async () => {
    if (!selectedTarget?.sessionId) return
    const preview = await previewReviewPacket({
      sessionId: selectedTarget.sessionId,
    })
    if (!preview) return
    setPacketPreviewOpen(true)
  }, [previewReviewPacket, selectedTarget?.sessionId])

  const handleSendReviewPacket = useCallback(async () => {
    if (!selectedTarget?.sessionId) return
    const result = await sendReviewPacket({
      sessionId: selectedTarget.sessionId,
    })
    if (!result) return
    setPacketPreviewOpen(false)
  }, [selectedTarget?.sessionId, sendReviewPacket])

  const handleRefresh = useCallback(() => {
    if (summaryInput) void loadSummary(summaryInput, { force: true })
    if (patchInput) void loadFilePatch(patchInput, { force: true })
  }, [loadFilePatch, loadSummary, patchInput, summaryInput])

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No active project
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <CodeReviewToolbar
        target={selectedTarget}
        mode={selectedMode}
        fileCount={files.length}
        loading={summaryLoading || diffLoading}
        onModeChange={handleModeChange}
        onRefresh={handleRefresh}
        onClose={onClose ?? closeReview}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,360px)_minmax(260px,320px)_minmax(0,1fr)_minmax(240px,300px)] overflow-hidden">
        <CodeReviewTargetRail
          targets={targetList}
          selectedTargetId={selectedTarget?.id ?? null}
          loading={targetsLoading}
          error={error}
          onSelectTarget={handleSelectTarget}
        />
        <CodeReviewFileRail
          files={files}
          visibleFiles={visibleFiles}
          selectedFile={selectedVisibleFile}
          loading={summaryLoading}
          noteCountsByPath={reviewNoteCountByFile}
          statusFilter={statusFilter}
          statusCounts={statusCounts}
          onStatusFilterChange={handleStatusFilterChange}
          onSelectFile={handleSelectFile}
        />
        <main className="min-w-0 overflow-hidden">
          <PierreDiffViewer
            file={selectedVisibleFile}
            diff={diff}
            loading={diffLoading}
            title={
              selectedMode === 'base-branch'
                ? 'Base branch diff'
                : 'Working tree diff'
            }
            selectedLines={selectedPierreLineRange}
            lineAnnotations={reviewNoteAnnotationMapping.annotations}
            renderAnnotation={renderReviewNoteAnnotation}
            onSelectedLinesChange={handlePierreDiffSelection}
            emptyMessage="Select a changed file to inspect its diff."
          />
        </main>
        <CodeReviewNotesRail
          target={selectedTarget}
          selectedFile={selectedVisibleFile}
          selectedLineCount={selectedDiffSummary.count}
          selectionSummary={selectedDiffSummary}
          draftCount={draftReviewNoteCount}
          noteGroups={reviewNoteGroups}
          noteFilter={reviewNoteFilter}
          noteStateCounts={reviewNoteStateCounts}
          packetPreview={packetPreview}
          packetPreviewOpen={packetPreviewOpen}
          error={reviewNotesError}
          activeNoteId={activeReviewNoteId}
          staleNoteIds={staleReviewNoteIdSet}
          lineComposerOpen={noteComposerOpen}
          lineDraftBody={noteDraftBody}
          fileComposerOpen={fileNoteComposerOpen}
          fileDraftBody={fileNoteDraftBody}
          editingNoteId={editingNoteId}
          editingBody={editingBody}
          onNoteFilterChange={setReviewNoteFilter}
          onOpenLineComposer={() => setNoteComposerOpen(true)}
          onCancelLineComposer={() => {
            setNoteComposerOpen(false)
            setNoteDraftBody('')
          }}
          onLineDraftBodyChange={setNoteDraftBody}
          onCreateLineNote={handleCreateReviewNote}
          onOpenFileComposer={() => setFileNoteComposerOpen(true)}
          onCancelFileComposer={() => {
            setFileNoteComposerOpen(false)
            setFileNoteDraftBody('')
          }}
          onFileDraftBodyChange={setFileNoteDraftBody}
          onCreateFileNote={handleCreateFileReviewNote}
          onPreviewPacket={handlePreviewReviewPacket}
          onClosePacketPreview={() => setPacketPreviewOpen(false)}
          onSendPacket={handleSendReviewPacket}
          onJumpToNote={handleReviewNoteJump}
          onEditNote={handleEditReviewNote}
          onEditingBodyChange={setEditingBody}
          onCancelEdit={() => {
            setEditingNoteId(null)
            setEditingBody('')
          }}
          onSaveNote={handleSaveReviewNote}
          onResolveNote={(note) =>
            void updateReviewNote(note.id, { state: 'resolved' })
          }
          onReopenNote={(note) =>
            void updateReviewNote(note.id, { state: 'draft' })
          }
          onDeleteNote={(note) =>
            selectedTarget?.sessionId
              ? void deleteReviewNote(note.id, selectedTarget.sessionId)
              : undefined
          }
        />
      </div>
    </div>
  )
}
