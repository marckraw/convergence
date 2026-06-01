import { createFileRoute } from '@tanstack/react-router'
import type { CodeReviewMode, CodeReviewView } from '@/entities/code-review'

interface CodeReviewSearch {
  targetId: string | null
  mode: CodeReviewMode
  view: CodeReviewView
  file: string | null
}

export const Route = createFileRoute('/code/review')({
  validateSearch: (search: Record<string, unknown>): CodeReviewSearch => ({
    targetId: parseOptionalString(search.targetId),
    mode: parseMode(search.mode),
    view: parseView(search.view),
    file: parseOptionalString(search.file),
  }),
})

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseMode(value: unknown): CodeReviewMode {
  return value === 'base-branch' ? 'base-branch' : 'working-tree'
}

function parseView(value: unknown): CodeReviewView {
  return value === 'diff' ? 'diff' : 'guide'
}
