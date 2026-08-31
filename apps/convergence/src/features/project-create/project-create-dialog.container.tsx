import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  deriveCloneFolderName,
  dialogApi,
  useProjectStore,
} from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { ProjectCreateDialog } from './project-create-dialog.presentational'

type ProjectOpenMode = 'local' | 'clone'

export const ProjectCreateDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'project-create')
  const closeDialog = useDialogStore((s) => s.close)
  const createProject = useProjectStore((s) => s.createProject)
  const cloneProject = useProjectStore((s) => s.cloneProject)
  const [mode, setMode] = useState<ProjectOpenMode>('local')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [parentDirectory, setParentDirectory] = useState('')
  const [directoryName, setDirectoryName] = useState('')
  const [directoryNameEdited, setDirectoryNameEdited] = useState(false)
  const [isOpeningLocal, setIsOpeningLocal] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setMode('local')
      setRemoteUrl('')
      setParentDirectory('')
      setDirectoryName('')
      setDirectoryNameEdited(false)
      setIsOpeningLocal(false)
      setIsCloning(false)
      setError(null)
    }
  }, [open])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) closeDialog()
    },
    [closeDialog],
  )

  const handleRemoteUrlChange = useCallback(
    (value: string) => {
      setRemoteUrl(value)
      setError(null)
      if (!directoryNameEdited) {
        setDirectoryName(deriveCloneFolderName(value))
      }
    },
    [directoryNameEdited],
  )

  const handleDirectoryNameChange = useCallback((value: string) => {
    setDirectoryName(value)
    setDirectoryNameEdited(true)
    setError(null)
  }, [])

  const handleSelectParentDirectory = useCallback(async () => {
    setError(null)
    const selected = await dialogApi.selectCloneParentDirectory()
    if (selected) setParentDirectory(selected)
  }, [])

  const handleOpenLocalProject = useCallback(async () => {
    setIsOpeningLocal(true)
    setError(null)
    const project = await createProject()
    setIsOpeningLocal(false)
    if (project) {
      closeDialog()
      return
    }
    const storeError = useProjectStore.getState().error
    if (storeError) setError(storeError)
  }, [closeDialog, createProject])

  const handleCloneProject = useCallback(async () => {
    setIsCloning(true)
    setError(null)
    const project = await cloneProject({
      remoteUrl,
      parentDirectory,
      directoryName,
    })
    setIsCloning(false)
    if (project) {
      closeDialog()
      return
    }
    setError(useProjectStore.getState().error ?? 'Failed to clone project')
  }, [cloneProject, closeDialog, directoryName, parentDirectory, remoteUrl])

  return (
    <ProjectCreateDialog
      open={open}
      mode={mode}
      remoteUrl={remoteUrl}
      parentDirectory={parentDirectory}
      directoryName={directoryName}
      isOpeningLocal={isOpeningLocal}
      isCloning={isCloning}
      error={error}
      onOpenChange={handleOpenChange}
      onModeChange={(nextMode) => {
        setMode(nextMode)
        setError(null)
      }}
      onRemoteUrlChange={handleRemoteUrlChange}
      onDirectoryNameChange={handleDirectoryNameChange}
      onSelectParentDirectory={handleSelectParentDirectory}
      onOpenLocalProject={handleOpenLocalProject}
      onCloneProject={handleCloneProject}
    />
  )
}
