import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import type { SelectedLineRange } from '@pierre/diffs'
import { Loader2 } from 'lucide-react'
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
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import {
  pullRequestReviewApi,
  usePullRequestStore,
} from '@/entities/pull-request'
import {
  selectReviewNotesForSession,
  useReviewNoteStore,
  type ReviewNote,
} from '@/entities/review-note'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
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

function formatPullRequestCheckoutError(err: unknown): string {
  const message =
    err instanceof Error ? err.message : 'Failed to check out pull request'
  const normalized = message.toLowerCase()

  if (
    normalized.includes('existing review workspace has local changes') ||
    normalized.includes('local changes')
  ) {
    return 'The existing PR worktree has local changes. Clean or archive it before refreshing this pull request.'
  }

  if (message.startsWith('GitHub CLI')) return message
  if (message.startsWith('Pull Request #')) return message
  return `Failed to check out pull request: ${message}`
}

function findMaterializedPullRequestTarget(input: {
  targets: CodeReviewTarget[]
  workspaceId: string
  pullRequestNumber: number
}): CodeReviewTarget | null {
  return (
    input.targets.find(
      (target) =>
        target.source === 'pull-request' &&
        target.workspaceId === input.workspaceId,
    ) ??
    input.targets.find(
      (target) =>
        target.source === 'pull-request' &&
        !!target.workspaceId &&
        target.pullRequestNumber === input.pullRequestNumber,
    ) ??
    input.targets.find((target) => target.workspaceId === input.workspaceId) ??
    input.targets[0] ??
    null
  )
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
  const openDialog = useDialogStore((state) => state.open)
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
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces)
  const loadGlobalWorkspaces = useWorkspaceStore(
    (state) => state.loadGlobalWorkspaces,
  )
  const loadPullRequestsByProjectId = usePullRequestStore(
    (state) => state.loadByProjectId,
  )
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
  const [materializingPullRequest, setMaterializingPullRequest] =
    useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
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

  const selectedTargetSupportsBaseBranch = Boolean(selectedTarget?.sessionId)
  const effectiveMode: CodeReviewMode =
    selectedMode === 'base-branch' && !selectedTargetSupportsBaseBranch
      ? 'working-tree'
      : selectedMode

  useEffect(() => {
    if (routeMode === 'base-branch' && !selectedTargetSupportsBaseBranch) {
      return
    }
    if (selectedMode !== routeMode) {
      setSelectedMode(routeMode)
    }
  }, [
    routeMode,
    selectedMode,
    selectedTargetSupportsBaseBranch,
    setSelectedMode,
  ])

  useEffect(() => {
    if (selectedMode === effectiveMode) return
    setSelectedMode(effectiveMode)
    onRouteSearchChange?.({ mode: effectiveMode, file: null })
  }, [effectiveMode, onRouteSearchChange, selectedMode, setSelectedMode])

  useEffect(() => {
    if (!pendingView || selectedView !== pendingView) return

    const timeout = window.setTimeout(() => setPendingView(null), 350)
    return () => window.clearTimeout(timeout)
  }, [pendingView, selectedView])

  const summaryInput = useMemo(
    () =>
      selectedTarget ? { target: selectedTarget, mode: effectiveMode } : null,
    [effectiveMode, selectedTarget],
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
            mode: effectiveMode,
            cacheIdentity: summary.cacheIdentity,
          }
        : null,
    [effectiveMode, selectedTarget, summary?.cacheIdentity],
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
  const displayGuide = guideGenerating ? EMPTY_GUIDE : (guide ?? fallbackGuide)
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
            mode: effectiveMode,
            filePath: selectedVisibleFile,
            cacheIdentity: summary?.cacheIdentity,
          }
        : null,
    [
      effectiveMode,
      selectedTarget,
      selectedVisibleFile,
      summary?.cacheIdentity,
    ],
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
          mode: effectiveMode,
          filePath,
          cacheIdentity: summary.cacheIdentity,
        })
        const selectionKey = buildCodeReviewFilePatchSelectionKey({
          target: selectedTarget,
          mode: effectiveMode,
          filePath,
        })
        const activeKey = filePatchKeysBySelectionKey[selectionKey] ?? key
        return [filePath, filePatchesByKey[activeKey] ?? '']
      }),
    )
  }, [
    filePatchKeysBySelectionKey,
    filePatchesByKey,
    effectiveMode,
    guideFilePaths,
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
          mode: effectiveMode,
          filePath,
          cacheIdentity: summary.cacheIdentity,
        })
        return [filePath, loadingFilePatchKeys[key] ?? false]
      }),
    )
  }, [
    guideFilePaths,
    loadingFilePatchKeys,
    effectiveMode,
    selectedTarget,
    summary?.cacheIdentity,
  ])
  const currentReviewNoteMode =
    effectiveMode === 'base-branch' ? 'base-branch' : 'working-tree'
  const remotePullRequestSelected = selectedTarget
    ? isRemotePullRequestTarget(selectedTarget)
    : false
  const workspaceBackedPullRequestSelected = Boolean(
    selectedTarget?.source === 'pull-request' && selectedTarget.workspaceId,
  )
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
        mode: effectiveMode,
        filePath,
        cacheIdentity: summary.cacheIdentity,
      })
    }
  }, [
    effectiveMode,
    guideFilePaths,
    loadFilePatch,
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
  }, [selectedTarget?.id, effectiveMode, selectedFile, diff])

  useEffect(() => {
    if (!pendingReviewNoteSelection) return
    if (effectiveMode !== pendingReviewNoteSelection.mode) return
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
    effectiveMode,
    pendingReviewNoteSelection,
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
      setCheckoutError(null)
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
      const nextMode =
        mode === 'base-branch' && !selectedTargetSupportsBaseBranch
          ? 'working-tree'
          : mode
      setHoldEmptySelection(false)
      setSelectedMode(nextMode)
      setSelectedFile(null)
      setStatusFilter('all')
      onRouteSearchChange?.({ mode: nextMode, file: null })
    },
    [
      onRouteSearchChange,
      selectedTargetSupportsBaseBranch,
      setSelectedFile,
      setSelectedMode,
    ],
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

      if (effectiveMode !== note.mode) {
        setSelectedMode(note.mode)
      }
      setSelectedFile(note.filePath)
    },
    [effectiveMode, setSelectedFile, setSelectedMode],
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
            mode: effectiveMode,
            filePath,
            cacheIdentity: summary.cacheIdentity,
          },
          { force: true },
        )
      }
    }
  }, [
    files,
    effectiveMode,
    guideFilePaths,
    guideInput,
    loadFilePatch,
    loadSummary,
    patchInput,
    refreshGuide,
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

  const handleMaterializePullRequest = useCallback(async () => {
    if (!activeProject || !selectedTarget) return
    if (!isRemotePullRequestTarget(selectedTarget)) return
    if (typeof selectedTarget.pullRequestNumber !== 'number') return
    if (materializingPullRequest) return

    setMaterializingPullRequest(true)
    setCheckoutError(null)

    try {
      const result = await pullRequestReviewApi.materializeReviewWorkspace({
        projectId: selectedTarget.projectId,
        reference: String(selectedTarget.pullRequestNumber),
      })
      const nextTargets = await loadTargets({
        projectId: selectedTarget.projectId,
        sessionId: activeSessionId,
      })
      await Promise.all([
        loadWorkspaces(selectedTarget.projectId),
        loadGlobalWorkspaces(),
        loadPullRequestsByProjectId(selectedTarget.projectId),
      ])

      const nextTarget = findMaterializedPullRequestTarget({
        targets: nextTargets,
        workspaceId: result.workspace.id,
        pullRequestNumber: selectedTarget.pullRequestNumber,
      })

      if (nextTarget) {
        setSelectedTarget(nextTarget)
        onRouteSearchChange?.({
          targetId: nextTarget.id,
          mode: effectiveMode,
          view: selectedView,
          file: selectedFile,
        })
        if (nextTarget.workspaceId !== result.workspace.id) {
          setCheckoutError(
            'Checked out the PR worktree, but the matching review target was not available after reload. Refresh code review if the target list looks stale.',
          )
        } else if (nextTarget.source !== 'pull-request') {
          setCheckoutError(
            'Checked out the PR worktree, but the PR review target was not available yet. Showing the workspace target instead.',
          )
        }
      } else {
        setCheckoutError(
          'Checked out the PR worktree, but no review targets were available after reload. Refresh code review to continue.',
        )
      }
    } catch (err) {
      setCheckoutError(formatPullRequestCheckoutError(err))
    } finally {
      setMaterializingPullRequest(false)
    }
  }, [
    activeProject,
    activeSessionId,
    loadGlobalWorkspaces,
    loadPullRequestsByProjectId,
    loadTargets,
    loadWorkspaces,
    materializingPullRequest,
    onRouteSearchChange,
    selectedFile,
    effectiveMode,
    selectedTarget,
    selectedView,
    setSelectedTarget,
  ])

  const handleStartWorkspaceSession = useCallback(() => {
    if (!selectedTarget?.workspaceId) return
    openDialog('session-intent', { workspaceId: selectedTarget.workspaceId })
  }, [openDialog, selectedTarget?.workspaceId])

  const gridTemplateColumns = [
    targetRailCollapsed ? REVIEW_TARGET_RAIL_COLLAPSED : REVIEW_TARGET_RAIL,
    REVIEW_FILE_RAIL,
    REVIEW_DIFF_PANE,
    notesRailCollapsed ? REVIEW_NOTES_RAIL_COLLAPSED : REVIEW_NOTES_RAIL,
  ].join(' ')
  const activeToolbarView = pendingView ?? selectedView
  const reviewLoadingLabel = pendingView
    ? `Opening ${pendingView === 'guide' ? 'guide' : 'diff'}...`
    : materializingPullRequest
      ? 'Checking out PR...'
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
        mode={effectiveMode}
        view={activeToolbarView}
        fileCount={files.length}
        loading={
          summaryLoading ||
          diffLoading ||
          guideLoading ||
          guideGenerating ||
          materializingPullRequest
        }
        statusLabel={reviewLoadingLabel}
        diffFocusActive={diffFocusActive}
        canMaterializePullRequest={remotePullRequestSelected}
        materializingPullRequest={materializingPullRequest}
        canStartWorkspaceSession={workspaceBackedPullRequestSelected}
        onModeChange={handleModeChange}
        onViewChange={handleViewChange}
        onMaterializePullRequest={() => void handleMaterializePullRequest()}
        onStartWorkspaceSession={handleStartWorkspaceSession}
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
          error={checkoutError ?? error ?? guideError}
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
            {guideGenerating ? (
              <main
                className="flex min-w-0 items-center justify-center bg-background p-6"
                role="status"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating guide...
                </div>
              </main>
            ) : (
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
            )}
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
                    : effectiveMode === 'base-branch'
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
