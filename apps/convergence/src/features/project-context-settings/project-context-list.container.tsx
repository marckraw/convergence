import { useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  useProjectContextStore,
  type ProjectContextItem,
  type ProjectContextReinjectMode,
} from '@/entities/project-context'
import { ProjectContextForm } from './project-context-form.presentational'
import { ProjectContextList } from './project-context-list.presentational'
import { useFormSubmitShortcut } from '@/shared/lib/use-form-submit-shortcut.pure'
import { Notice, useConfirm } from '@convergence/ui'

interface ProjectContextSettingsProps {
  projectId: string
}

type FormState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; item: ProjectContextItem }

const EMPTY_ITEMS: ProjectContextItem[] = []

export const ProjectContextSettings: FC<ProjectContextSettingsProps> = ({
  projectId,
}) => {
  const itemsByProjectId = useProjectContextStore(
    (state) => state.itemsByProjectId,
  )
  const items = itemsByProjectId[projectId] ?? EMPTY_ITEMS
  const isLoading = useProjectContextStore((state) => state.loading)
  const error = useProjectContextStore((state) => state.error)
  const loadForProject = useProjectContextStore((state) => state.loadForProject)
  const createItem = useProjectContextStore((state) => state.createItem)
  const updateItem = useProjectContextStore((state) => state.updateItem)
  const deleteItem = useProjectContextStore((state) => state.deleteItem)
  const clearError = useProjectContextStore((state) => state.clearError)
  const confirm = useConfirm()

  const [formState, setFormState] = useState<FormState>({ mode: 'closed' })
  const [labelDraft, setLabelDraft] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [modeDraft, setModeDraft] = useState<ProjectContextReinjectMode>('boot')
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    void loadForProject(projectId)
  }, [projectId, loadForProject])

  const openCreate = () => {
    clearError()
    setFormError(null)
    setLabelDraft('')
    setBodyDraft('')
    setModeDraft('boot')
    setFormState({ mode: 'create' })
  }

  const openEdit = (item: ProjectContextItem) => {
    clearError()
    setFormError(null)
    setLabelDraft(item.label ?? '')
    setBodyDraft(item.body)
    setModeDraft(item.reinjectMode)
    setFormState({ mode: 'edit', item })
  }

  const closeForm = () => {
    setFormState({ mode: 'closed' })
    setFormError(null)
  }

  const handleSubmit = async () => {
    if (formState.mode === 'closed') return
    setIsSaving(true)
    setFormError(null)
    try {
      const trimmedLabel = labelDraft.trim()
      const labelValue = trimmedLabel.length > 0 ? trimmedLabel : null
      if (formState.mode === 'create') {
        const created = await createItem({
          projectId,
          label: labelValue,
          body: bodyDraft,
          reinjectMode: modeDraft,
        })
        if (created === null) {
          setFormError(
            useProjectContextStore.getState().error ??
              'Failed to create context item',
          )
          return
        }
      } else {
        const updated = await updateItem(formState.item.id, {
          label: labelValue,
          body: bodyDraft,
          reinjectMode: modeDraft,
        })
        if (updated === null) {
          setFormError(
            useProjectContextStore.getState().error ??
              'Failed to update context item',
          )
          return
        }
      }
      closeForm()
    } finally {
      setIsSaving(false)
    }
  }

  // Enable cmd+Enter to submit the form
  useFormSubmitShortcut(formState.mode !== 'closed', handleSubmit)

  // What can't be taken back asks first, in the app's own dialog (R5).
  const handleDeleteRequest = async (item: ProjectContextItem) => {
    const confirmed = await confirm({
      title: `Delete “${item.label?.trim() || 'Untitled'}”?`,
      description:
        'The context item is deleted from this project. Sessions stop getting it from their next start or turn.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (confirmed) await deleteItem(item.id, projectId)
  }

  return (
    <section className="space-y-4">
      {formState.mode === 'closed' ? (
        <ProjectContextList
          items={items}
          isLoading={isLoading}
          isEmpty={!isLoading && items.length === 0}
          onCreateClick={openCreate}
          onEditClick={openEdit}
          onDeleteRequest={(item) => void handleDeleteRequest(item)}
        />
      ) : (
        <ProjectContextForm
          mode={formState.mode}
          label={labelDraft}
          body={bodyDraft}
          reinjectMode={modeDraft}
          isSaving={isSaving}
          error={formError}
          onLabelChange={setLabelDraft}
          onBodyChange={setBodyDraft}
          onReinjectModeChange={setModeDraft}
          onSubmit={() => void handleSubmit()}
          onCancel={closeForm}
        />
      )}
      {error && formState.mode === 'closed' ? (
        <Notice tone="danger" title={error} />
      ) : null}
    </section>
  )
}
