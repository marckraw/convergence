export type ProjectOpenAppId =
  | 'cursor'
  | 'vscode'
  | 'zed'
  | 'webstorm'
  | 'finder'

export type ProjectOpenAppKind = 'editor' | 'file-manager'

export interface ProjectOpenApp {
  id: ProjectOpenAppId
  label: string
  kind: ProjectOpenAppKind
}

export interface ProjectOpenRequest {
  appId: ProjectOpenAppId
  path: string
}
