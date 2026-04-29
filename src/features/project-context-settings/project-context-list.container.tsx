import { useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  useProjectContextStore,
  type ProjectContextItem,
  type ProjectContextReinjectMode,
} from '@/entities/project-context'
import { ProjectContextForm } from './project-context-form.presentational'
import { ProjectContextList } from './project-context-list.presentational'

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

  const [formState, setFormState] = useState<FormState>({ mode: 'closed' })
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
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

  const handleDeleteConfirm = async (id: string) => {
    await deleteItem(id, projectId)
    setPendingDeleteId(null)
  }

  return (
    <section className="space-y-4">
      {formState.mode === 'closed' ? (
        <ProjectContextList
          items={items}
          isLoading={isLoading}
          isEmpty={!isLoading && items.length === 0}
          pendingDeleteId={pendingDeleteId}
          onCreateClick={openCreate}
          onEditClick={openEdit}
          onDeleteRequest={setPendingDeleteId}
          onDeleteConfirm={(id) => void handleDeleteConfirm(id)}
          onDeleteCancel={() => setPendingDeleteId(null)}
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
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
