interface GuideSectionViewportSnapshot {
  id: string
  top: number
  bottom: number
}

interface SelectActiveGuideSectionInput {
  sections: GuideSectionViewportSnapshot[]
  viewportTop: number
  viewportBottom: number
  activationOffset: number
}

export function buildCodeReviewGuideFileAnchorKey(input: {
  sectionId: string
  filePath: string
}): string {
  return `${encodeURIComponent(input.sectionId)}:${encodeURIComponent(
    input.filePath,
  )}`
}

export function selectActiveCodeReviewGuideSection(
  input: SelectActiveGuideSectionInput,
): string | null {
  if (input.sections.length === 0) return null

  const visibleSections = input.sections
    .filter(
      (section) =>
        section.bottom > input.viewportTop &&
        section.top < input.viewportBottom,
    )
    .sort((a, b) => a.top - b.top)

  if (visibleSections.length === 0) return null

  const activationLine = Math.min(
    input.viewportBottom,
    input.viewportTop + input.activationOffset,
  )
  const containingActivationLine = [...visibleSections]
    .filter(
      (section) =>
        section.top <= activationLine && section.bottom > activationLine,
    )
    .sort((a, b) => b.top - a.top)[0]

  if (containingActivationLine) return containingActivationLine.id

  const nearestStartedSection = [...visibleSections]
    .filter((section) => section.top <= activationLine)
    .sort((a, b) => b.top - a.top)[0]

  return nearestStartedSection?.id ?? visibleSections[0].id
}
