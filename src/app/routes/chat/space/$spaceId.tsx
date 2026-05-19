import { createFileRoute } from '@tanstack/react-router'

interface ChatSpaceSearch {
  draft: boolean
}

export const Route = createFileRoute('/chat/space/$spaceId')({
  validateSearch: (search: Record<string, unknown>): ChatSpaceSearch => ({
    draft: search.draft === true || search.draft === 'true',
  }),
})
