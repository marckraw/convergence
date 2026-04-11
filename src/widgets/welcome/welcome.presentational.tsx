import type { FC, ReactNode } from 'react'

interface WelcomeShellProps {
  createButton: ReactNode
}

export const WelcomeShell: FC<WelcomeShellProps> = ({ createButton }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
    <h1 className="text-4xl font-bold tracking-tight">
      Welcome to Convergence
    </h1>
    <p className="mt-4 max-w-md text-center text-lg text-muted-foreground">
      Create a project from a local git repository to get started.
    </p>
    <div className="mt-8">{createButton}</div>
  </div>
)
