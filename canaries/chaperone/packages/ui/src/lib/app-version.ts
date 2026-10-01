// canary: ui-package-imports-no-app
// A design-system helper that reads the preload bridge, which only the app's *.api.ts may touch.
export const appVersion = () => window.electronAPI.appVersion
