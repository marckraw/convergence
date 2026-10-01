// Not a canary: the .api module draft.pure.ts imports, so that import resolves.
export function saveDraft(text: string) {
  return window.electronAPI.saveDraft(text)
}
