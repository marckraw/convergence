import { createFileRoute } from '@tanstack/react-router'

interface NewCodeSessionSearch {
  workspaceId: string | null
}

export const Route = createFileRoute('/code/sessions/new')({
  validateSearch: (search: Record<string, unknown>): NewCodeSessionSearch => ({
    workspaceId:
      typeof search.workspaceId === 'string' ? search.workspaceId : null,
  }),
})
