import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import { useDialogStore, type DialogKind } from '@/entities/dialog'

async function hopToProject(projectId: string): Promise<void> {
  const projectState = useProjectStore.getState()
  const targetProject = projectState.projects.find(
    (project) => project.id === projectId,
  )

  useSessionStore.getState().prepareForProject(projectId)
  await projectState.setActiveProject(projectId)

  const workspaceState = useWorkspaceStore.getState()
  const sessionState = useSessionStore.getState()

  if (targetProject) {
    await Promise.all([
      workspaceState.loadWorkspaces(targetProject.id),
      workspaceState.loadCurrentBranch(targetProject.repositoryPath),
      sessionState.loadSessions(targetProject.id),
    ])
  } else {
    await sessionState.loadSessions(projectId)
  }
}

export async function switchToSession(sessionId: string): Promise<void> {
  const sessionState = useSessionStore.getState()
  const target = sessionState.globalSessions.find(
    (session) => session.id === sessionId,
  )
  if (!target) return

  const activeProject = useProjectStore.getState().activeProject
  if (activeProject?.id !== target.projectId) {
    await hopToProject(target.projectId)
  }

  useSessionStore.getState().setActiveSession(sessionId)
}

export async function activateProject(projectId: string): Promise<void> {
  const activeProject = useProjectStore.getState().activeProject
  if (activeProject?.id === projectId) return
  await hopToProject(projectId)
}

export function openDialog(kind: DialogKind): void {
  useDialogStore.getState().open(kind)
}
