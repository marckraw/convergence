// Frozen S1 frames: 650 story + 490 panel content + two 70px gutters.
// Shorter windows keep that horizontal layout and scroll vertically.
export function resolveStudioWindowSize(workArea: {
  width: number
  height: number
}) {
  return {
    width: Math.min(1440, workArea.width),
    height: Math.min(960, workArea.height),
    minWidth: 1280,
    minHeight: 800,
  }
}
