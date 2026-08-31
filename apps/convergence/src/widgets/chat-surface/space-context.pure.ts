import type { Space, SpaceSource } from '@/entities/space'

export interface SpaceContextSelection {
  includeBrief: boolean
  includeMemory: boolean
  selectedSourceIds: string[]
}

interface BuildSpaceContextBlockInput {
  space: Space
  sources: SpaceSource[]
  selection: SpaceContextSelection
}

export function buildSpaceContextBlock({
  space,
  sources,
  selection,
}: BuildSpaceContextBlockInput): string | null {
  const sections: string[] = []

  if (selection.includeBrief && space.brief.trim()) {
    sections.push(`Space brief:\n${space.brief.trim()}`)
  }

  if (selection.includeMemory && space.memory.trim()) {
    sections.push(`Space memory and instructions:\n${space.memory.trim()}`)
  }

  const selectedSources = sources.filter((source) =>
    selection.selectedSourceIds.includes(source.id),
  )
  if (selectedSources.length > 0) {
    sections.push(
      [
        'Selected Space sources:',
        ...selectedSources.map(
          (source) => `- ${source.filename}: ${source.storagePath}`,
        ),
      ].join('\n'),
    )
  }

  if (sections.length === 0) return null

  return [
    '<space_context>',
    `Space: ${space.title}`,
    ...sections,
    '</space_context>',
  ].join('\n\n')
}

export function applySpaceContextToMessage(
  message: string,
  contextBlock: string | null,
): string {
  if (!contextBlock) return message
  const trimmedMessage = message.trim()
  if (!trimmedMessage) return contextBlock
  return `${contextBlock}\n\nUser request:\n${trimmedMessage}`
}
