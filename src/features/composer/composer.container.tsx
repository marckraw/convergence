import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC, ClipboardEvent, DragEvent } from 'react'
import {
  resolveProviderSelection,
  useSessionStore,
  type ReasoningEffort,
} from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import {
  attachmentApi,
  useAttachmentStore,
  type Attachment,
  type AttachmentIngestFileInput,
} from '@/entities/attachment'
import {
  skillSelectionFromCatalogEntry,
  useSkillStore,
  type SkillCatalogEntry,
  type SkillSelection,
} from '@/entities/skill'
import { Composer } from './composer.presentational'
import { validateAttachmentsAgainstCapability } from './attachment-capability.pure'
import { AttachmentPreviewContainer } from './attachment-preview.container'
import {
  filterComposerSkills,
  filterSelectionsForProvider,
} from './composer-skill-picker.pure'

interface ComposerContainerProps {
  projectId: string
  workspaceId: string | null
  activeSessionId: string | null
}

const DRAFT_KEY_NEW = '__new__'

function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer | null,
): File[] {
  if (!dataTransfer) return []
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files)
  }
  const items = dataTransfer.items
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

async function filesToIngestInputs(
  files: File[],
): Promise<AttachmentIngestFileInput[]> {
  const inputs: AttachmentIngestFileInput[] = []
  for (const file of files) {
    const buffer = await file.arrayBuffer()
    inputs.push({
      name: file.name || 'pasted-file',
      bytes: new Uint8Array(buffer),
      mimeType: file.type || undefined,
    })
  }
  return inputs
}

export const ComposerContainer: FC<ComposerContainerProps> = ({
  projectId,
  workspaceId,
  activeSessionId,
}) => {
  const [value, setValue] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [effortId, setEffortId] = useState<ReasoningEffort | ''>('')
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null,
  )
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<SkillSelection[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)
  const providers = useSessionStore((s) => s.providers)
  const openDialog = useDialogStore((s) => s.open)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)
  const sendMessageToSession = useSessionStore((s) => s.sendMessageToSession)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeProvider = providers.find(
    (p) => p.id === activeSession?.providerId,
  )
  const canContinueActiveSession =
    !!activeSession && !!activeProvider?.supportsContinuation
  const appSettings = useAppSettingsStore((s) => s.settings)
  const storedDefaults = useMemo(
    () => ({
      providerId: appSettings.defaultProviderId,
      modelId: appSettings.defaultModelId,
      effortId: appSettings.defaultEffortId,
    }),
    [
      appSettings.defaultProviderId,
      appSettings.defaultModelId,
      appSettings.defaultEffortId,
    ],
  )
  const selection = resolveProviderSelection(
    providers,
    activeSession?.providerId ?? providerId,
    activeSession?.model ?? modelId,
    activeSession?.effort ?? (effortId || null),
    activeSession ? undefined : storedDefaults,
  )

  const draftKey = activeSessionId ?? DRAFT_KEY_NEW
  const draft = useAttachmentStore((s) => s.drafts[draftKey])
  const ingestFiles = useAttachmentStore((s) => s.ingestFiles)
  const ingestFromPaths = useAttachmentStore((s) => s.ingestFromPaths)
  const removeDraft = useAttachmentStore((s) => s.removeDraft)
  const clearDraft = useAttachmentStore((s) => s.clearDraft)
  const clearRejections = useAttachmentStore((s) => s.clearRejections)
  const skillCatalog = useSkillStore((s) => s.catalog)
  const loadSkillCatalog = useSkillStore((s) => s.loadCatalog)
  const skillCatalogLoading = useSkillStore((s) => s.isCatalogLoading)
  const skillCatalogError = useSkillStore((s) => s.catalogError)

  const attachments = draft?.items ?? []
  const rejections = draft?.rejections ?? []
  const ingestInFlight = draft?.ingestInFlight ?? false

  const capability = selection.provider?.attachments ?? null
  const capabilityResult = useMemo(
    () => validateAttachmentsAgainstCapability(attachments, capability),
    [attachments, capability],
  )
  const skillOptions = useMemo(
    () =>
      filterComposerSkills({
        catalog: skillCatalog,
        providerId: selection.providerId,
        query: skillQuery,
      }),
    [skillCatalog, selection.providerId, skillQuery],
  )

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  useEffect(() => {
    setSelectedSkills([])
    setSkillQuery('')
    setSkillPickerOpen(false)
  }, [projectId, activeSessionId])

  useEffect(() => {
    setSelectedSkills((current) =>
      filterSelectionsForProvider(current, selection.providerId),
    )
  }, [selection.providerId])

  useEffect(() => {
    if (activeSession) {
      setProviderId(activeSession.providerId)
      setModelId(activeSession.model ?? '')
      setEffortId(activeSession.effort ?? '')
      return
    }

    if (!selection.providerId) {
      return
    }

    setProviderId((current) => current || selection.providerId)
    setModelId((current) => current || selection.modelId)
    setEffortId((current) => current || selection.effortId)
  }, [
    activeSession,
    selection.providerId,
    selection.modelId,
    selection.effortId,
  ])

  useEffect(() => {
    if (rejections.length > 0) {
      const handle = window.setTimeout(() => {
        clearRejections(draftKey)
      }, 6000)
      return () => window.clearTimeout(handle)
    }
    return undefined
  }, [rejections, draftKey, clearRejections])

  const isSessionDone =
    !activeSession ||
    activeSession.status === 'completed' ||
    activeSession.status === 'failed'
  const isComposerDisabled =
    activeSession?.status === 'running' &&
    activeSession.attention !== 'needs-input'

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!selection.providerId || !selection.modelId) return
    if (!trimmed && attachments.length === 0) return
    if (!capabilityResult.ok) return

    const attachmentIds = attachments.map((a) => a.id)
    const hasAttachments = attachmentIds.length > 0
    const skillSelections =
      selectedSkills.length > 0 ? selectedSkills : undefined

    if (activeSession && canContinueActiveSession) {
      if (hasAttachments || skillSelections) {
        sendMessageToSession(
          activeSession.id,
          trimmed,
          hasAttachments ? attachmentIds : undefined,
          skillSelections,
        )
      } else {
        sendMessageToSession(activeSession.id, trimmed)
      }
      setValue('')
      setSelectedSkills([])
      clearDraft(draftKey)
      return
    }

    const baseName = trimmed || attachments[0]?.filename || 'New session'
    const name =
      baseName.length > 40 ? baseName.substring(0, 40) + '...' : baseName
    if (hasAttachments || skillSelections) {
      createAndStartSession(
        projectId,
        workspaceId,
        selection.providerId,
        selection.modelId,
        selection.effort?.id ?? null,
        name,
        trimmed,
        hasAttachments ? attachmentIds : undefined,
        skillSelections,
      )
    } else {
      createAndStartSession(
        projectId,
        workspaceId,
        selection.providerId,
        selection.modelId,
        selection.effort?.id ?? null,
        name,
        trimmed,
      )
    }
    setValue('')
    setSelectedSkills([])
    clearDraft(draftKey)
  }, [
    value,
    selection.providerId,
    selection.modelId,
    selection.effort,
    attachments,
    selectedSkills,
    capabilityResult.ok,
    activeSession,
    canContinueActiveSession,
    sendMessageToSession,
    createAndStartSession,
    clearDraft,
    draftKey,
    projectId,
    workspaceId,
  ])

  const handleProviderChange = (nextProviderId: string) => {
    const nextSelection = resolveProviderSelection(
      providers,
      nextProviderId,
      null,
      null,
      activeSession ? undefined : storedDefaults,
    )
    setProviderId(nextSelection.providerId)
    setModelId(nextSelection.modelId)
    setEffortId(nextSelection.effortId)
  }

  const handleSkillPickerOpenChange = useCallback(
    (nextOpen: boolean) => {
      setSkillPickerOpen(nextOpen)
      if (nextOpen) void loadSkillCatalog(projectId)
    },
    [loadSkillCatalog, projectId],
  )

  const handleSkillToggle = useCallback((skill: SkillCatalogEntry) => {
    if (!skill.enabled) return

    setSelectedSkills((current) => {
      const existingSelection = current.some(
        (selection) => selection.id === skill.id,
      )

      if (existingSelection) {
        return current.filter((selection) => selection.id !== skill.id)
      }

      return [...current, skillSelectionFromCatalogEntry(skill)]
    })
  }, [])

  const handleSkillRemove = useCallback((skillId: string) => {
    setSelectedSkills((current) =>
      current.filter((selection) => selection.id !== skillId),
    )
  }, [])

  const handleModelChange = (nextModelId: string) => {
    const nextSelection = resolveProviderSelection(
      providers,
      selection.providerId,
      nextModelId,
      null,
      activeSession ? undefined : storedDefaults,
    )
    setModelId(nextSelection.modelId)
    setEffortId(nextSelection.effortId)
  }

  const handleAttachmentAdd = useCallback(async () => {
    const paths = await attachmentApi.showOpenDialog()
    if (!paths || paths.length === 0) return
    await ingestFromPaths(draftKey, paths)
  }, [draftKey, ingestFromPaths])

  const ingestFilesFromFileList = useCallback(
    async (files: File[]) => {
      const inputs = await filesToIngestInputs(files)
      if (inputs.length === 0) return
      await ingestFiles(draftKey, inputs)
    },
    [draftKey, ingestFiles],
  )

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = collectFilesFromDataTransfer(e.clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      void ingestFilesFromFileList(files)
    },
    [ingestFilesFromFileList],
  )

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepth.current = 0
      setIsDragging(false)
      const files = collectFilesFromDataTransfer(e.dataTransfer)
      if (files.length > 0) void ingestFilesFromFileList(files)
    },
    [ingestFilesFromFileList],
  )

  const handleAttachmentRemove = useCallback(
    (attachmentId: string) => {
      void removeDraft(draftKey, attachmentId)
    },
    [draftKey, removeDraft],
  )

  const handleSkillsBrowse = useCallback(() => {
    setSkillPickerOpen(false)
    openDialog('skills-browser')
  }, [openDialog])

  return (
    <>
      <Composer
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        providers={providers}
        selection={selection}
        onProviderChange={handleProviderChange}
        onModelChange={handleModelChange}
        onEffortChange={setEffortId}
        selectionDisabled={canContinueActiveSession}
        placeholder={
          activeSession?.attention === 'needs-input'
            ? 'Respond to the agent...'
            : canContinueActiveSession
              ? 'Send a follow-up...'
              : isSessionDone
                ? 'What would you like to work on?'
                : 'Session is running...'
        }
        disabled={isComposerDisabled}
        attachments={attachments}
        attachmentErrorByAttachmentId={capabilityResult.errorByAttachmentId}
        hasAttachmentErrors={!capabilityResult.ok}
        attachmentsIngestInFlight={ingestInFlight}
        isDragging={isDragging}
        skillPickerOpen={skillPickerOpen}
        skillQuery={skillQuery}
        skillOptions={skillOptions}
        selectedSkills={selectedSkills}
        skillCatalogLoading={skillCatalogLoading}
        skillCatalogError={skillCatalogError}
        onSkillPickerOpenChange={handleSkillPickerOpenChange}
        onSkillQueryChange={setSkillQuery}
        onSkillToggle={handleSkillToggle}
        onSkillRemove={handleSkillRemove}
        onSkillsBrowse={handleSkillsBrowse}
        onAttachmentAdd={handleAttachmentAdd}
        onAttachmentRemove={handleAttachmentRemove}
        onAttachmentOpen={setPreviewAttachment}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      />
      {rejections.length > 0 && (
        <div
          role="status"
          className="mx-auto mt-2 w-full max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {rejections.map((r, i) => (
            <div key={`${r.filename}-${i}`}>
              <span className="font-medium">{r.filename}:</span> {r.reason}
            </div>
          ))}
        </div>
      )}
      <AttachmentPreviewContainer
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </>
  )
}
