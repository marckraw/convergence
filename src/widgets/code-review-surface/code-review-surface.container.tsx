import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import type { SelectedLineRange } from '@pierre/diffs'
import {
  buildCodeReviewFilePatchKey,
  buildCodeReviewFilePatchSelectionKey,
  buildCodeReviewSummarySelectionKey,
  countCodeReviewFilesByStatus,
  isRemotePullRequestTarget,
  selectCodeReviewFileAfterReload,
  useCodeReviewStore,
  type CodeReviewMode,
  type CodeReviewTarget,
  type CodeReviewView,
} from '@/entities/code-review'
import {
  buildCodeReviewGuideKey,
  buildDeterministicCodeReviewGuide,
  useCodeReviewGuideStore,
} from '@/entities/code-review-guide'
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
import { CodeReviewGuideRail } from './code-review-guide-rail.presentational'
import { CodeReviewGuideView } from './code-review-guide.presentational'
import { CodeReviewNotesRail } from './code-review-notes-rail.presentational'
import { CodeReviewTargetRail } from './code-review-target-rail.presentational'
import { CodeReviewToolbar } from './code-review-toolbar.presentational'

interface CodeReviewSurfaceProps {
  routeTargetId?: string | null
  routeMode?: CodeReviewMode
  routeView?: CodeReviewView
  routeFilePath?: string | null
  onRouteSearchChange?: (search: {
    targetId?: string | null
    mode?: CodeReviewMode
    view?: CodeReviewView
    file?: string | null
  }) => void
  onClose?: () => void
}

const REVIEW_TARGET_RAIL = 'minmax(280px, 360px)'
const REVIEW_TARGET_RAIL_COLLAPSED = '48px'
const REVIEW_FILE_RAIL = 'minmax(260px, 320px)'
const REVIEW_DIFF_PANE = 'minmax(0, 1fr)'
const REVIEW_NOTES_RAIL = 'minmax(240px, 300px)'
const REVIEW_NOTES_RAIL_COLLAPSED = '48px'
const TARGET_RAIL_COLLAPSE_WIDTH = 1440
const NOTES_RAIL_COLLAPSE_WIDTH = 1280

const EMPTY_GUIDE = buildDeterministicCodeReviewGuide([])

function getInitialReviewRailState(): {
  targetRailCollapsed: boolean
  notesRailCollapsed: boolean
} {
  if (typeof window === 'undefined') {
    return {
      targetRailCollapsed: false,
      notesRailCollapsed: false,
    }
  }

  return {
    targetRailCollapsed: window.innerWidth < TARGET_RAIL_COLLAPSE_WIDTH,
    notesRailCollapsed: window.innerWidth < NOTES_RAIL_COLLAPSE_WIDTH,
  }
}

export const CodeReviewSurface: FC<CodeReviewSurfaceProps> = ({
  routeTargetId = null,
  routeMode = 'working-tree',
  routeView = 'guide',
  routeFilePath = null,
  onRouteSearchChange,
  onClose,
}) => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const targets = useCodeReviewStore((state) => state.targets)
  const selectedTarget = useCodeReviewStore((state) => state.selectedTarget)
  const selectedMode = useCodeReviewStore((state) => state.selectedMode)
  const selectedView = useCodeReviewStore((state) => state.selectedView)
  const selectedFile = useCodeReviewStore((state) => state.selectedFile)
  const targetsLoading = useCodeReviewStore((state) => state.targetsLoading)
  const summariesByKey = useCodeReviewStore((state) => state.summariesByKey)
  const summaryKeysBySelectionKey = useCodeReviewStore(
    (state) => state.summaryKeysBySelectionKey,
  )
  const filePatchesByKey = useCodeReviewStore((state) => state.filePatchesByKey)
  const filePatchKeysBySelectionKey = useCodeReviewStore(
    (state) => state.filePatchKeysBySelectionKey,
  )
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
  const setSelectedView = useCodeReviewStore((state) => state.setSelectedView)
  const setSelectedFile = useCodeReviewStore((state) => state.setSelectedFile)
  const closeReview = useCodeReviewStore((state) => state.closeReview)
  const guidesByKey = useCodeReviewGuideStore((state) => state.guidesByKey)
  const loadingGuideKeys = useCodeReviewGuideStore(
    (state) => state.loadingGuideKeys,
  )
  const generatingGuideKeys = useCodeReviewGuideStore(
    (state) => state.generatingGuideKeys,
  )
  const guideError = useCodeReviewGuideStore((state) => state.error)
  const loadGuide = useCodeReviewGuideStore((state) => state.loadGuide)
  const generateGuide = useCodeReviewGuideStore((state) => state.generateGuide)
  const refreshGuide = useCodeReviewGuideStore((state) => state.refreshGuide)
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
  const [targetRailCollapsed, setTargetRailCollapsed] = useState(
    () => getInitialReviewRailState().targetRailCollapsed,
  )
  const [notesRailCollapsed, setNotesRailCollapsed] = useState(
    () => getInitialReviewRailState().notesRailCollapsed,
  )
  const [diffFocusActive, setDiffFocusActive] = useState(false)
  const [pendingView, setPendingView] = useState<CodeReviewView | null>(null)
  const railsBeforeDiffFocusRef = useRef({
    targetRailCollapsed: false,
    notesRailCollapsed: false,
  })
  const lastAppliedRouteFilePathRef = useRef<string | null | undefined>(
    undefined,
  )
  const guideSectionRefs = useRef(new Map<string, HTMLElement>())
  const guideFileRefs = useRef(new Map<string, HTMLElement>())

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
    if (selectedView !== routeView) {
      setSelectedView(routeView)
    }
  }, [routeView, selectedView, setSelectedView])

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

  useEffect(() => {
    if (!pendingView || selectedView !== pendingView) return

    const timeout = window.setTimeout(() => setPendingView(null), 350)
    return () => window.clearTimeout(timeout)
  }, [pendingView, selectedView])

  const summaryInput = useMemo(
    () =>
      selectedTarget ? { target: selectedTarget, mode: selectedMode } : null,
    [selectedMode, selectedTarget],
  )
  const summarySelectionKey = summaryInput
    ? buildCodeReviewSummarySelectionKey(summaryInput)
    : ''
  const summaryKey = summarySelectionKey
    ? (summaryKeysBySelectionKey[summarySelectionKey] ?? '')
    : ''
  const summary = summaryKey ? (summariesByKey[summaryKey] ?? null) : null
  const summaryLoading = summarySelectionKey
    ? (loadingSummaryKeys[summarySelectionKey] ?? false)
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
  const guideInput = useMemo(
    () =>
      selectedTarget && summary?.cacheIdentity
        ? {
            target: selectedTarget,
            mode: selectedMode,
            cacheIdentity: summary.cacheIdentity,
          }
        : null,
    [selectedMode, selectedTarget, summary?.cacheIdentity],
  )
  const guideKey = guideInput ? buildCodeReviewGuideKey(guideInput) : ''
  const guide = guideKey ? (guidesByKey[guideKey] ?? null) : null
  const guideLoading = guideKey ? (loadingGuideKeys[guideKey] ?? false) : false
  const guideGenerating = guideKey
    ? (generatingGuideKeys[guideKey] ?? false)
    : false
  const fallbackGuide = useMemo(
    () =>
      files.length > 0 ? buildDeterministicCodeReviewGuide(files) : EMPTY_GUIDE,
    [files],
  )
  const displayGuide = guide ?? fallbackGuide
  const guideFilePaths = useMemo(
    () =>
      displayGuide.sections.flatMap((section) =>
        section.files.map((file) => file.path),
      ),
    [displayGuide],
  )
  const [activeGuideSectionId, setActiveGuideSectionId] = useState<
    string | null
  >(null)
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
            cacheIdentity: summary?.cacheIdentity,
          }
        : null,
    [selectedMode, selectedTarget, selectedVisibleFile, summary?.cacheIdentity],
  )
  const patchKey =
    patchInput && patchInput.cacheIdentity
      ? buildCodeReviewFilePatchKey({
          ...patchInput,
          cacheIdentity: patchInput.cacheIdentity,
        })
      : ''
  const patchSelectionKey = patchInput
    ? buildCodeReviewFilePatchSelectionKey(patchInput)
    : ''
  const activePatchKey = patchSelectionKey
    ? (filePatchKeysBySelectionKey[patchSelectionKey] ?? patchKey)
    : patchKey
  const diff = activePatchKey ? (filePatchesByKey[activePatchKey] ?? '') : ''
  const diffLoading = patchKey
    ? (loadingFilePatchKeys[patchKey] ?? false)
    : false
  const guidePatchByFile = useMemo(() => {
    if (!selectedTarget || !summary?.cacheIdentity)
      return new Map<string, string>()

    return new Map(
      guideFilePaths.map((filePath) => {
        const key = buildCodeReviewFilePatchKey({
          target: selectedTarget,
          mode: selectedMode,
          filePath,
          cacheIdentity: summary.cacheIdentity,
        })
        const selectionKey = buildCodeReviewFilePatchSelectionKey({
          target: selectedTarget,
          mode: selectedMode,
          filePath,
        })
        const activeKey = filePatchKeysBySelectionKey[selectionKey] ?? key
        return [filePath, filePatchesByKey[activeKey] ?? '']
      }),
    )
  }, [
    filePatchKeysBySelectionKey,
    filePatchesByKey,
    guideFilePaths,
    selectedMode,
    selectedTarget,
    summary?.cacheIdentity,
  ])
  const guideLoadingByFile = useMemo(() => {
    if (!selectedTarget || !summary?.cacheIdentity)
      return new Map<string, boolean>()

    return new Map(
      guideFilePaths.map((filePath) => {
        const key = buildCodeReviewFilePatchKey({
          target: selectedTarget,
          mode: selectedMode,
          filePath,
          cacheIdentity: summary.cacheIdentity,
        })
        return [filePath, loadingFilePatchKeys[key] ?? false]
      }),
    )
  }, [
    guideFilePaths,
    loadingFilePatchKeys,
    selectedMode,
    selectedTarget,
    summary?.cacheIdentity,
  ])
  const currentReviewNoteMode =
    selectedMode === 'base-branch' ? 'base-branch' : 'working-tree'
  const remotePullRequestSelected = selectedTarget
    ? isRemotePullRequestTarget(selectedTarget)
    : false
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
    if (selectedView !== 'guide' || !guideInput) return
    void loadGuide(guideInput)
  }, [guideInput, loadGuide, selectedView])

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
    if (!patchInput?.cacheIdentity) return
    if (selectedView !== 'diff') return
    void loadFilePatch({
      ...patchInput,
      cacheIdentity: patchInput.cacheIdentity,
    })
  }, [loadFilePatch, patchInput, selectedView])

  useEffect(() => {
    if (selectedView !== 'guide') return
    if (!selectedTarget || !summary?.cacheIdentity) return

    for (const filePath of guideFilePaths) {
      void loadFilePatch({
        target: selectedTarget,
        mode: selectedMode,
        filePath,
        cacheIdentity: summary.cacheIdentity,
      })
    }
  }, [
    guideFilePaths,
    loadFilePatch,
    selectedMode,
    selectedTarget,
    selectedView,
    summary?.cacheIdentity,
  ])

  useEffect(() => {
    if (displayGuide.sections.length === 0) {
      setActiveGuideSectionId(null)
      return
    }
    if (
      activeGuideSectionId &&
      displayGuide.sections.some(
        (section) => section.id === activeGuideSectionId,
      )
    ) {
      return
    }
    setActiveGuideSectionId(displayGuide.sections[0].id)
  }, [activeGuideSectionId, displayGuide.sections])

  useEffect(() => {
    if (selectedView !== 'guide') return
    if (typeof IntersectionObserver === 'undefined') return

    const observedSections = displayGuide.sections
      .map((section) => ({
        id: section.id,
        node: guideSectionRefs.current.get(section.id),
      }))
      .filter(
        (entry): entry is { id: string; node: HTMLElement } =>
          entry.node !== undefined,
      )

    if (observedSections.length === 0) return

    const sectionIdByNode = new Map(
      observedSections.map((section) => [section.node, section.id]),
    )
    const observer = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0]
        const sectionId = activeEntry
          ? (sectionIdByNode.get(activeEntry.target as HTMLElement) ?? null)
          : null
        if (sectionId) setActiveGuideSectionId(sectionId)
      },
      {
        root: null,
        rootMargin: '-18% 0px -60% 0px',
        threshold: 0,
      },
    )

    for (const section of observedSections) {
      observer.observe(section.node)
    }

    return () => observer.disconnect()
  }, [displayGuide.sections, selectedView])

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

  const handleViewChange = useCallback(
    (view: CodeReviewView) => {
      if (view !== selectedView) {
        setPendingView(view)
      }
      setSelectedView(view)
      onRouteSearchChange?.({ view })
    },
    [onRouteSearchChange, selectedView, setSelectedView],
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

  const handleSelectGuideSection = useCallback((sectionId: string) => {
    setActiveGuideSectionId(sectionId)
    guideSectionRefs.current
      .get(sectionId)
      ?.scrollIntoView({ block: 'start', inline: 'nearest' })
  }, [])

  const handleSelectGuideFile = useCallback(
    (filePath: string) => {
      setSelectedFile(filePath)
      onRouteSearchChange?.({ file: filePath })
      guideFileRefs.current
        .get(filePath)
        ?.scrollIntoView({ block: 'start', inline: 'nearest' })
    },
    [onRouteSearchChange, setSelectedFile],
  )

  const renderGuideSectionRef = useCallback(
    (sectionId: string) => (node: HTMLElement | null) => {
      if (node) {
        guideSectionRefs.current.set(sectionId, node)
        return
      }
      guideSectionRefs.current.delete(sectionId)
    },
    [],
  )

  const renderGuideFileRef = useCallback(
    (filePath: string) => (node: HTMLElement | null) => {
      if (node) {
        guideFileRefs.current.set(filePath, node)
        return
      }
      guideFileRefs.current.delete(filePath)
    },
    [],
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

  const handleGenerateGuide = useCallback(() => {
    if (!guideInput || files.length === 0) return
    void generateGuide({ ...guideInput, files })
  }, [files, generateGuide, guideInput])

  const handleRefresh = useCallback(() => {
    if (summaryInput) void loadSummary(summaryInput, { force: true })
    if (selectedView === 'guide' && guideInput) {
      void refreshGuide({ ...guideInput, files })
    }
    if (selectedView === 'diff' && patchInput?.cacheIdentity) {
      void loadFilePatch(
        {
          ...patchInput,
          cacheIdentity: patchInput.cacheIdentity,
        },
        { force: true },
      )
    }
    if (selectedView === 'guide' && selectedTarget && summary?.cacheIdentity) {
      for (const filePath of guideFilePaths) {
        void loadFilePatch(
          {
            target: selectedTarget,
            mode: selectedMode,
            filePath,
            cacheIdentity: summary.cacheIdentity,
          },
          { force: true },
        )
      }
    }
  }, [
    files,
    guideFilePaths,
    guideInput,
    loadFilePatch,
    loadSummary,
    patchInput,
    refreshGuide,
    selectedMode,
    selectedTarget,
    selectedView,
    summary?.cacheIdentity,
    summaryInput,
  ])

  const handleToggleTargetRail = useCallback(() => {
    setDiffFocusActive(false)
    setTargetRailCollapsed((collapsed) => !collapsed)
  }, [])

  const handleToggleNotesRail = useCallback(() => {
    setDiffFocusActive(false)
    setNotesRailCollapsed((collapsed) => !collapsed)
  }, [])

  const handleToggleDiffFocus = useCallback(() => {
    if (diffFocusActive) {
      setTargetRailCollapsed(
        railsBeforeDiffFocusRef.current.targetRailCollapsed,
      )
      setNotesRailCollapsed(railsBeforeDiffFocusRef.current.notesRailCollapsed)
      setDiffFocusActive(false)
      return
    }

    railsBeforeDiffFocusRef.current = {
      targetRailCollapsed,
      notesRailCollapsed,
    }
    setTargetRailCollapsed(true)
    setNotesRailCollapsed(true)
    setDiffFocusActive(true)
  }, [diffFocusActive, notesRailCollapsed, targetRailCollapsed])

  const gridTemplateColumns = [
    targetRailCollapsed ? REVIEW_TARGET_RAIL_COLLAPSED : REVIEW_TARGET_RAIL,
    REVIEW_FILE_RAIL,
    REVIEW_DIFF_PANE,
    notesRailCollapsed ? REVIEW_NOTES_RAIL_COLLAPSED : REVIEW_NOTES_RAIL,
  ].join(' ')
  const activeToolbarView = pendingView ?? selectedView
  const reviewLoadingLabel = pendingView
    ? `Opening ${pendingView === 'guide' ? 'guide' : 'diff'}...`
    : guideGenerating
      ? 'Generating guide...'
      : selectedView === 'guide' && (summaryLoading || guideLoading)
        ? 'Loading guide...'
        : selectedView === 'diff' && diffLoading
          ? 'Loading diff...'
          : null

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
        view={activeToolbarView}
        fileCount={files.length}
        loading={
          summaryLoading || diffLoading || guideLoading || guideGenerating
        }
        statusLabel={reviewLoadingLabel}
        diffFocusActive={diffFocusActive}
        onModeChange={handleModeChange}
        onViewChange={handleViewChange}
        onToggleDiffFocus={handleToggleDiffFocus}
        onRefresh={handleRefresh}
        onClose={onClose ?? closeReview}
      />

      <div
        className="relative grid min-h-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns }}
      >
        {reviewLoadingLabel ? (
          <div
            className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
            role="status"
          >
            {reviewLoadingLabel}
          </div>
        ) : null}
        <CodeReviewTargetRail
          targets={targetList}
          selectedTargetId={selectedTarget?.id ?? null}
          loading={targetsLoading}
          error={error ?? guideError}
          collapsed={targetRailCollapsed}
          onToggleCollapsed={handleToggleTargetRail}
          onSelectTarget={handleSelectTarget}
        />
        {selectedView === 'guide' ? (
          <>
            <CodeReviewGuideRail
              guide={displayGuide}
              activeSectionId={activeGuideSectionId}
              loading={summaryLoading || guideLoading || guideGenerating}
              generating={guideGenerating}
              canGenerate={Boolean(guideInput && files.length > 0)}
              onSelectSection={handleSelectGuideSection}
              onGenerateGuide={handleGenerateGuide}
            />
            <CodeReviewGuideView
              guide={displayGuide}
              getFileDiff={(filePath) => guidePatchByFile.get(filePath) ?? ''}
              isFileLoading={(filePath) =>
                guideLoadingByFile.get(filePath) ?? false
              }
              renderSectionRef={renderGuideSectionRef}
              renderFileRef={renderGuideFileRef}
              onSelectFile={handleSelectGuideFile}
            />
          </>
        ) : (
          <>
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
                  remotePullRequestSelected
                    ? 'Pull request diff'
                    : selectedMode === 'base-branch'
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
          </>
        )}
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
          collapsed={notesRailCollapsed}
          lineComposerOpen={noteComposerOpen}
          lineDraftBody={noteDraftBody}
          fileComposerOpen={fileNoteComposerOpen}
          fileDraftBody={fileNoteDraftBody}
          editingNoteId={editingNoteId}
          editingBody={editingBody}
          onNoteFilterChange={setReviewNoteFilter}
          onToggleCollapsed={handleToggleNotesRail}
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
