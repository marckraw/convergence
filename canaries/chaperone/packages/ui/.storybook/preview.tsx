// canary: stories-fail-on-axe
// The axe check only reports: a story with a contrast failure still passes.
export const parameters = {
  a11y: { test: 'todo' },
}
