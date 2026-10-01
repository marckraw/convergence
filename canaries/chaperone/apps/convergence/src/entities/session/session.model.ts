// Not a canary: the file composer.container.tsx reaches for past the slice's index.ts.
export function useSessionStore() {
  return 'session-1'
}
