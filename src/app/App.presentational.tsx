import type { FC } from 'react'
import type { Project } from '@/entities/project'
import { Welcome } from '@/widgets/welcome'
import { ProjectHeader } from '@/widgets/project-header'

interface AppShellProps {
  activeProject: Project | null
  loading: boolean
}

export const AppShell: FC<AppShellProps> = ({ activeProject, loading }) => {
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!activeProject) {
    return <Welcome />
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProjectHeader />
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Repository
          </p>
          <p className="mt-1 font-mono text-sm">
            {activeProject.repositoryPath}
          </p>
          <p className="mt-6 text-sm font-medium text-muted-foreground">
            Created
          </p>
          <p className="mt-1 text-sm">
            {new Date(activeProject.createdAt).toLocaleDateString()}
          </p>
          <p className="mt-8 text-muted-foreground">
            Sessions and agent tools will appear here in future phases.
          </p>
        </div>
      </main>
    </div>
  )
}
